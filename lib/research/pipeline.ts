import type { LLMProvider } from "@/lib/ai/provider";
import { createMockToolRegistry } from "@/lib/tools/mock-registry";
import type { ToolRegistry } from "@/lib/tools/registry";
import type { MCPClient } from "@/lib/tools/mcp";
import {
  COMPANY_RESEARCH_SERVER_ID,
  LOOKUP_COMPANY_PROFILE_TOOL,
} from "@/lib/tools/mcp/schemas";
import { createCompanyResearchServerConfig } from "@/lib/tools/mcp/client";
import { ResearchNotFoundError, ResearchStageError } from "./errors";
import { enrichResearchWithCompanyProfiles } from "./enrich";
import { retrieveResearchSources, searchResearchTasks } from "./gather";
import { planResearch } from "./plan";
import { isTerminalStatus } from "./status";
import type { ResearchStore } from "./store";
import { analyseResearch, type ResearchAnalysis } from "./analyse";
import { extractEvidenceFromSources } from "./extract";
import { generateCitationBackedReport } from "./report";
import { verifyFindings } from "./stages";
import type { ResearchStage, ResearchStatus } from "./types";
import { RESEARCH_STAGES } from "./types";

export type PipelineOptions = {
  store: ResearchStore;
  tools?: ToolRegistry;
  llm: LLMProvider;
  mcp?: MCPClient;
  failAt?: ResearchStage;
};

export type PipelineResult = {
  projectId: string;
  status: ResearchStatus;
  executedStages: ResearchStage[];
  errorMessage?: string;
};

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

async function withConnectedMcp(
  mcp: MCPClient,
  run: (client: MCPClient) => Promise<void>,
): Promise<void> {
  const config = createCompanyResearchServerConfig();
  await mcp.connect(config);
  try {
    await run(mcp);
  } finally {
    await mcp.disconnect(config.id);
  }
}

export async function runResearchPipeline(
  projectId: string,
  options: PipelineOptions,
): Promise<PipelineResult> {
  const store = options.store;
  const tools = options.tools ?? createMockToolRegistry();
  const executedStages: ResearchStage[] = [];
  let analysis: ResearchAnalysis | undefined;

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
        const planned = await planResearch(project.question, options.llm);
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
        await searchResearchTasks(projectId, store, searchTool);
        executedStages.push(stage);
        continue;
      }

      if (stage === "retrieve") {
        const fetchTool = await requireTool(tools, "fetch_page", "retrieve");
        await retrieveResearchSources(projectId, store, fetchTool);
        executedStages.push(stage);
        continue;
      }

      if (stage === "enrich") {
        // Best-effort MCP enrichment. Soft-fails per domain; never fails the project.
        if (options.mcp) {
          const mcpTool = tools.getMcp(
            COMPANY_RESEARCH_SERVER_ID,
            LOOKUP_COMPANY_PROFILE_TOOL,
          );
          if (!mcpTool) {
            console.error(
              `[research enrich] MCP tool not registered project=${projectId}`,
            );
          } else {
            try {
              await withConnectedMcp(options.mcp, async (mcp) => {
                await enrichResearchWithCompanyProfiles({
                  projectId,
                  store,
                  mcp,
                });
              });
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "unknown error";
              console.error(
                `[research enrich] MCP stage failed project=${projectId} error=${message}`,
              );
            }
          }
        }
        executedStages.push(stage);
        continue;
      }

      if (stage === "extract") {
        const [sources, tasks] = await Promise.all([
          store.listSources(projectId),
          store.listTasks(projectId),
        ]);
        const extracted = await extractEvidenceFromSources({
          question: project.question,
          sources,
          tasks,
          llm: options.llm,
        });
        for (const finding of extracted) {
          await store.createFinding(finding);
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
        const [findings, sources, tasks] = await Promise.all([
          store.listFindings(projectId),
          store.listSources(projectId),
          store.listTasks(projectId),
        ]);
        analysis = await analyseResearch({
          question: project.question,
          findings,
          sources,
          llm: options.llm,
        });
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
        if (!analysis) {
          throw new ResearchStageError(
            "report",
            "Analysis is required before report generation",
          );
        }

        const [findings, sources] = await Promise.all([
          store.listFindings(projectId),
          store.listSources(projectId),
        ]);
        const generated = await generateCitationBackedReport({
          question: project.question,
          analysis,
          findings,
          sources,
          llm: options.llm,
        });
        await store.createReport({
          projectId,
          markdown: generated.markdown,
          outlineJson: JSON.parse(JSON.stringify(generated.outline)),
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
