import { createHash } from "node:crypto";
import { createMockToolRegistry } from "@/lib/tools/mock-registry";
import type { ToolRegistry } from "@/lib/tools/registry";
import { ResearchNotFoundError, ResearchStageError } from "./errors";
import { isTerminalStatus } from "./status";
import type { ResearchStore } from "./store";
import {
  analyseFindings,
  extractFindings,
  generateReport,
  planResearch,
  verifyFindings,
} from "./stages";
import type { ResearchStage, ResearchStatus } from "./types";
import { RESEARCH_STAGES } from "./types";

export type PipelineOptions = {
  store: ResearchStore;
  tools?: ToolRegistry;
  failAt?: ResearchStage;
};

export type PipelineResult = {
  projectId: string;
  status: ResearchStatus;
  executedStages: ResearchStage[];
  errorMessage?: string;
};

function hashContent(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown pipeline error";
}

async function requireTool(
  tools: ToolRegistry,
  name: string,
  stage: ResearchStage,
) {
  const tool = tools.getInternal(name);
  if (!tool) {
    throw new ResearchStageError(
      stage,
      `Required tool is not registered: ${name}`,
    );
  }
  return tool;
}

export async function runResearchPipeline(
  projectId: string,
  options: PipelineOptions,
): Promise<PipelineResult> {
  const store = options.store;
  const tools = options.tools ?? createMockToolRegistry();
  const executedStages: ResearchStage[] = [];

  const project = await store.getProject(projectId);
  if (!project) {
    throw new ResearchNotFoundError(projectId);
  }

  if (project.status !== "queued") {
    return {
      projectId,
      status: project.status,
      executedStages: [],
    };
  }

  try {
    for (const stage of RESEARCH_STAGES) {
      if (options.failAt === stage) {
        throw new ResearchStageError(stage, `Forced failure at stage: ${stage}`);
      }

      if (stage === "plan") {
        await store.transitionStatus(projectId, "planning");
        const planned = planResearch(project.question);
        for (const item of planned) {
          await store.createTask({
            projectId,
            title: item.title,
            query: item.query,
            sortOrder: item.sortOrder,
          });
        }
        executedStages.push(stage);
        continue;
      }

      if (stage === "search") {
        await store.transitionStatus(projectId, "researching");
        const searchTool = await requireTool(tools, "search", "search");
        const tasks = await store.listTasks(projectId);

        for (const task of tasks) {
          await store.updateTask(task.id, { status: "running" });
          const input = searchTool.inputSchema.parse({ query: task.query });
          const result = await searchTool.execute(input, { projectId });

          if (!result.ok) {
            await store.updateTask(task.id, { status: "failed" });
            throw new ResearchStageError(
              "search",
              `Search failed for task "${task.title}": ${result.error}`,
            );
          }

          const hits = (result.data as { results?: Array<{ url: string; title: string; snippet: string }> }).results ?? [];
          for (const hit of hits) {
            await store.createSource({
              projectId,
              taskId: task.id,
              url: hit.url,
              title: hit.title,
              snippet: hit.snippet,
              toolName: "search",
            });
          }

          await store.updateTask(task.id, {
            status: "completed",
            resultJson: { resultCount: hits.length },
          });
        }

        executedStages.push(stage);
        continue;
      }

      if (stage === "retrieve") {
        const fetchTool = await requireTool(tools, "fetch_page", "retrieve");
        const sources = await store.listSources(projectId);

        for (const source of sources) {
          const input = fetchTool.inputSchema.parse({ url: source.url });
          const result = await fetchTool.execute(input, { projectId });

          if (!result.ok) {
            throw new ResearchStageError(
              "retrieve",
              `Fetch failed for ${source.url}: ${result.error}`,
            );
          }

          const page = result.data as {
            title?: string;
            content?: string;
            httpStatus?: number;
          };

          const content = page.content ?? "";
          await store.updateSource(source.id, {
            title: page.title ?? source.title,
            content,
            contentHash: hashContent(content),
            httpStatus: page.httpStatus ?? 200,
            toolName: "fetch_page",
            fetchedAt: new Date(),
          });
        }

        executedStages.push(stage);
        continue;
      }

      if (stage === "extract") {
        const sources = await store.listSources(projectId);
        for (const source of sources) {
          for (const finding of extractFindings(source)) {
            await store.createFinding({
              projectId,
              sourceId: source.id,
              ...finding,
            });
          }
        }
        executedStages.push(stage);
        continue;
      }

      if (stage === "verify") {
        await store.transitionStatus(projectId, "verifying");
        const findings = await store.listFindings(projectId);
        verifyFindings(findings);
        executedStages.push(stage);
        continue;
      }

      if (stage === "analyse") {
        await store.transitionStatus(projectId, "analysing");
        const findings = await store.listFindings(projectId);
        const analysis = analyseFindings(project.question, findings);
        const tasks = await store.listTasks(projectId);
        const lastTask = tasks.at(-1);
        if (lastTask) {
          await store.updateTask(lastTask.id, {
            resultJson: analysis,
          });
        }
        executedStages.push(stage);
        continue;
      }

      if (stage === "report") {
        await store.transitionStatus(projectId, "reporting");
        const [findings, sources] = await Promise.all([
          store.listFindings(projectId),
          store.listSources(projectId),
        ]);
        const analysis = analyseFindings(project.question, findings);
        const generated = generateReport({
          question: project.question,
          analysis,
          findings,
          sources,
        });
        await store.createReport({
          projectId,
          markdown: generated.markdown,
          outlineJson: generated.outline,
        });
        await store.transitionStatus(projectId, "completed");
        executedStages.push(stage);
      }
    }

    const completed = await store.getProject(projectId);
    return {
      projectId,
      status: completed?.status ?? "completed",
      executedStages,
    };
  } catch (error) {
    const current = await store.getProject(projectId);
    if (current && !isTerminalStatus(current.status)) {
      await store.transitionStatus(
        projectId,
        "failed",
        errorMessage(error),
      );
    }

    return {
      projectId,
      status: "failed" as ResearchStatus,
      executedStages,
      errorMessage: errorMessage(error),
    };
  }
}
