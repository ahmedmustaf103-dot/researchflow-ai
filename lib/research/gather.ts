import { createHash } from "node:crypto";
import type { InternalTool } from "@/lib/tools/types";
import { mapWithConcurrency } from "@/lib/tools/concurrency";
import {
  MAX_FETCH_CONCURRENCY,
  MAX_PAGES_PER_PROJECT,
  MAX_RESEARCH_TASKS,
  MAX_SEARCH_RESULTS_PER_QUERY,
  SEARCH_QUERIES_PER_TASK,
} from "./limits";
import { ResearchStageError } from "./errors";
import type { ResearchStore } from "./store";
import type { FetchedPage, SearchHit, Source } from "./types";

function hashContent(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function selectSourcesForRetrieval(
  sources: Source[],
  limit = MAX_PAGES_PER_PROJECT,
): Source[] {
  return sources.slice(0, limit);
}

export async function searchResearchTasks(
  projectId: string,
  store: ResearchStore,
  searchTool: InternalTool<unknown, unknown>,
): Promise<void> {
  const tasks = (await store.listTasks(projectId)).slice(0, MAX_RESEARCH_TASKS);
  let successfulSearches = 0;
  let failedSearches = 0;

  for (const task of tasks) {
    await store.updateTask(task.id, { status: "running" });

    let lastError: string | undefined;
    let hits: SearchHit[] = [];
    let searchSucceeded = false;

    for (let queryIndex = 0; queryIndex < SEARCH_QUERIES_PER_TASK; queryIndex += 1) {
      const input = searchTool.inputSchema.parse({ query: task.query });
      const result = await searchTool.execute(input, { projectId });

      if (!result.ok) {
        lastError = result.error;
        continue;
      }

      searchSucceeded = true;
      hits = ((result.data as { results?: SearchHit[] }).results ?? []).slice(
        0,
        MAX_SEARCH_RESULTS_PER_QUERY,
      );
    }

    if (!searchSucceeded) {
      failedSearches += 1;
      await store.updateTask(task.id, {
        status: "failed",
        resultJson: { error: lastError ?? "Search failed" },
      });
      console.error(
        `[research search] task failed project=${projectId} task=${task.id}`,
      );
      continue;
    }

    successfulSearches += 1;
    let persisted = 0;

    for (const hit of hits) {
      const existing = await store.findSourceByUrl(projectId, hit.url);
      if (existing) {
        continue;
      }

      await store.createSource({
        projectId,
        taskId: task.id,
        url: hit.url,
        title: hit.title,
        snippet: hit.snippet,
        toolName: "search",
      });
      persisted += 1;
    }

    await store.updateTask(task.id, {
      status: "completed",
      resultJson: {
        resultCount: hits.length,
        persistedCount: persisted,
      },
    });
  }

  if (tasks.length > 0 && successfulSearches === 0 && failedSearches > 0) {
    throw new ResearchStageError(
      "search",
      "All searches failed. No sources were gathered.",
    );
  }
}

export async function retrieveResearchSources(
  projectId: string,
  store: ResearchStore,
  fetchTool: InternalTool<unknown, unknown>,
): Promise<void> {
  const sources = selectSourcesForRetrieval(await store.listSources(projectId));

  await mapWithConcurrency(sources, MAX_FETCH_CONCURRENCY, async (source) => {
    const input = fetchTool.inputSchema.parse({ url: source.url });
    const result = await fetchTool.execute(input, { projectId });

    if (!result.ok) {
      await store.updateSource(source.id, {
        httpStatus: result.statusCode ?? 0,
        fetchedAt: new Date(),
      });
      console.error(
        `[research retrieve] fetch failed project=${projectId} source=${source.id}`,
      );
      return;
    }

    const page = result.data as FetchedPage;
    const content = page.content ?? "";

    await store.updateSource(source.id, {
      title: page.title || source.title,
      content,
      contentHash: hashContent(content),
      httpStatus: page.httpStatus ?? 200,
      toolName: "fetch_page",
      fetchedAt: new Date(),
    });
  });
}
