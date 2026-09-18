import { z } from "zod";
import { createMockLLMProvider } from "@/lib/ai/mock";
import { createMemoryResearchStore } from "@/lib/research/memory-store";
import { retrieveResearchSources } from "@/lib/research/gather";
import { runResearchPipeline } from "@/lib/research/pipeline";
import { createQueuedProject } from "@/lib/research/service";
import { MAX_SEARCH_RETRIES } from "@/lib/research/limits";
import { createMockToolRegistry } from "@/lib/tools/mock-registry";
import { createToolRegistry } from "@/lib/tools/registry";
import { createBraveSearchTool } from "@/lib/tools/search/brave";
import { mockFetchPageTool } from "@/lib/tools/fetch-page";
import { enrichResearchWithCompanyProfiles } from "@/lib/research/enrich";
import type { MCPClient, MCPToolDefinition } from "@/lib/tools/mcp";
import type { InternalTool, ToolResult } from "@/lib/tools/types";
import {
  scoreFailureIsolation,
  scoreRetryBudget,
} from "../scorers/reliability";
import {
  allChecksPassed,
  type EvalCase,
  type EvalResult,
} from "../types";
import { EVAL_RESEARCH_QUESTION } from "./fixtures";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function resultFromScorer(
  caseId: string,
  scorer: { checks: EvalResult["checks"]; metrics: EvalResult["metrics"] },
  extraChecks: EvalResult["checks"] = [],
): EvalResult {
  const checks = [...scorer.checks, ...extraChecks];
  return {
    caseId,
    passed: allChecksPassed(checks),
    checks,
    metrics: scorer.metrics,
  };
}

function createCountingFetch(
  handler: (attempt: number) => Promise<Response>,
): { fetchFn: typeof fetch; getAttempts: () => number } {
  let attempts = 0;
  const fetchFn = (async () => {
    attempts += 1;
    return handler(attempts);
  }) as unknown as typeof fetch;

  return {
    fetchFn,
    getAttempts: () => attempts,
  };
}

export const reliabilityEvalCases: EvalCase[] = [
  {
    id: "reliability.search-retry-then-success",
    title: "Transient search failure then success",
    category: "reliability",
    description:
      "Brave tool retries a 500 then succeeds within MAX_SEARCH_RETRIES budget.",
    async execute() {
      const { fetchFn, getAttempts } = createCountingFetch(async (attempt) => {
        if (attempt === 1) {
          return jsonResponse({ error: "upstream" }, 500);
        }
        return jsonResponse({
          web: {
            results: [
              {
                title: "Eval fixture result",
                url: "https://example.test/payments",
                description: "Fixture hit",
              },
            ],
          },
        });
      });

      const tool = createBraveSearchTool({
        apiKey: "eval-test-key",
        fetch: fetchFn,
      });
      const result = await tool.execute({ query: "Stripe Adyen PayPal" }, {});
      const attempts = getAttempts();

      return resultFromScorer(
        "reliability.search-retry-then-success",
        scoreRetryBudget({
          attempts,
          maxAttempts: MAX_SEARCH_RETRIES + 1,
          succeeded: result.ok,
        }),
        [
          {
            id: "reliability.search_result_ok",
            description: "Final Brave ToolResult is ok",
            expected: true,
            actual: result.ok,
            passed: result.ok,
          },
        ],
      );
    },
  },
  {
    id: "reliability.search-auth-no-retry",
    title: "Authentication failure does not retry",
    category: "reliability",
    description: "Brave 401 responses are non-retryable and attempted once.",
    async execute() {
      const { fetchFn, getAttempts } = createCountingFetch(async () =>
        jsonResponse({ error: "unauthorized" }, 401),
      );

      const tool = createBraveSearchTool({
        apiKey: "eval-test-key",
        fetch: fetchFn,
      });
      const result = await tool.execute({ query: "Stripe Adyen PayPal" }, {});
      const attempts = getAttempts();

      return resultFromScorer(
        "reliability.search-auth-no-retry",
        scoreRetryBudget({
          attempts,
          maxAttempts: MAX_SEARCH_RETRIES + 1,
          succeeded: false,
          expectSingleAttempt: true,
        }),
        [
          {
            id: "reliability.auth_not_ok",
            description: "Auth failure ToolResult is not ok",
            expected: false,
            actual: result.ok,
            passed: result.ok === false,
          },
          {
            id: "reliability.auth_not_retryable",
            description: "Auth failure is marked non-retryable",
            expected: false,
            actual: result.ok ? null : result.retryable,
            passed: result.ok === false && result.retryable === false,
          },
        ],
      );
    },
  },
  {
    id: "reliability.search-timeout-budget",
    title: "Timeout respects retry budget",
    category: "reliability",
    description:
      "Abort/timeout errors are retryable but stop after MAX_SEARCH_RETRIES.",
    async execute() {
      const { fetchFn, getAttempts } = createCountingFetch(async () => {
        throw Object.assign(new Error("The operation was aborted"), {
          name: "AbortError",
        });
      });

      const tool = createBraveSearchTool({
        apiKey: "eval-test-key",
        fetch: fetchFn,
        timeoutMs: 5,
      });
      const result = await tool.execute({ query: "Stripe Adyen PayPal" }, {});
      const attempts = getAttempts();

      return resultFromScorer(
        "reliability.search-timeout-budget",
        scoreRetryBudget({
          attempts,
          maxAttempts: MAX_SEARCH_RETRIES + 1,
          succeeded: false,
        }),
        [
          {
            id: "reliability.timeout_not_ok",
            description: "Timeout ToolResult is not ok",
            expected: false,
            actual: result.ok,
            passed: result.ok === false,
          },
          {
            id: "reliability.timeout_retryable_flag",
            description: "Timeout is classified retryable",
            expected: true,
            actual: result.ok ? null : result.retryable,
            passed: result.ok === false && result.retryable === true,
          },
          {
            id: "reliability.timeout_exhausted_budget",
            description: "Attempts equal initial try + MAX_SEARCH_RETRIES",
            expected: MAX_SEARCH_RETRIES + 1,
            actual: attempts,
            passed: attempts === MAX_SEARCH_RETRIES + 1,
          },
        ],
      );
    },
  },
  {
    id: "reliability.all-search-failure",
    title: "All-search failure fails the project",
    category: "reliability",
    description:
      "When every search fails, the pipeline fails and no report is written.",
    async execute() {
      const store = createMemoryResearchStore();
      const project = await createQueuedProject(
        "eval-user",
        EVAL_RESEARCH_QUESTION,
        store,
      );

      const failingSearch: InternalTool<
        { query: string },
        { results: never[] }
      > = {
        source: "internal",
        name: "search",
        description: "Eval failing search",
        inputSchema: z.object({ query: z.string().min(1) }),
        async execute() {
          return {
            ok: false,
            error: "eval search unavailable",
            retryable: true,
          };
        },
      };

      const tools = createMockToolRegistry();
      const registry = createToolRegistry();
      registry.registerInternal(failingSearch);
      registry.registerInternal(mockFetchPageTool);
      for (const tool of tools.listMcp()) {
        registry.registerMcp(tool);
      }

      const result = await runResearchPipeline(project.id, {
        store,
        tools: registry,
        llm: createMockLLMProvider(),
      });
      const detail = await store.getProjectDetail(project.id, "eval-user");

      return resultFromScorer(
        "reliability.all-search-failure",
        scoreFailureIsolation({
          projectStatus: result.status,
          expectedStatus: "failed",
          fabricatedSources: (detail?.sources ?? []).some((source) =>
            source.url.startsWith("mcp://"),
          ),
          expectFabricatedSources: false,
          hasReport: Boolean(detail?.report),
          expectReport: false,
        }),
      );
    },
  },
  {
    id: "reliability.partial-retrieve-preserves-source",
    title: "Partial retrieval preserves Source",
    category: "reliability",
    description:
      "A failed page fetch still leaves the Source row in the store.",
    async execute() {
      const store = createMemoryResearchStore();
      const project = await store.createProject({
        userId: "eval-user",
        title: "Eval retrieve",
        question: EVAL_RESEARCH_QUESTION,
      });
      const task = await store.createTask({
        projectId: project.id,
        title: "Pricing",
        query: "payment pricing",
        sortOrder: 1,
      });
      await store.createSource({
        projectId: project.id,
        taskId: task.id,
        url: "https://example.test/preserve-me",
        title: "Preserve me",
        snippet: "fixture",
        toolName: "search",
      });

      const failingFetch: InternalTool<unknown, unknown> = {
        source: "internal",
        name: "fetch_page",
        description: "Eval failing fetch",
        inputSchema: z.object({ url: z.string().url() }),
        async execute() {
          return {
            ok: false,
            error: "eval jina 502",
            retryable: true,
            statusCode: 502,
          };
        },
      };

      await retrieveResearchSources(project.id, store, failingFetch);
      const sources = await store.listSources(project.id);
      const projectRow = await store.getProject(project.id);

      return resultFromScorer(
        "reliability.partial-retrieve-preserves-source",
        scoreFailureIsolation({
          projectStatus: projectRow?.status ?? "unknown",
          expectedStatus: "queued",
          fabricatedSources: false,
          hasReport: false,
          expectReport: false,
          preservedSourceCount: sources.length,
          expectPreservedSources: 1,
        }),
        [
          {
            id: "reliability.source_url_preserved",
            description: "Original Source URL remains after fetch failure",
            expected: "https://example.test/preserve-me",
            actual: sources[0]?.url,
            passed: sources[0]?.url === "https://example.test/preserve-me",
          },
        ],
      );
    },
  },
  {
    id: "reliability.analysis-failure-no-report",
    title: "Analysis failure yields failed project",
    category: "reliability",
    description: "failAnalysis leaves status=failed and report=null.",
    async execute() {
      const store = createMemoryResearchStore();
      const project = await createQueuedProject(
        "eval-user",
        EVAL_RESEARCH_QUESTION,
        store,
      );
      const result = await runResearchPipeline(project.id, {
        store,
        tools: createMockToolRegistry(),
        llm: createMockLLMProvider({ failAnalysis: true }),
      });
      const detail = await store.getProjectDetail(project.id, "eval-user");

      return resultFromScorer(
        "reliability.analysis-failure-no-report",
        scoreFailureIsolation({
          projectStatus: result.status,
          expectedStatus: "failed",
          fabricatedSources: false,
          hasReport: Boolean(detail?.report),
          expectReport: false,
        }),
      );
    },
  },
  {
    id: "reliability.mcp-failure-no-fabrication",
    title: "MCP failure does not fabricate Sources",
    category: "reliability",
    description:
      "Failed MCP lookups must not invent mcp:// company profile Sources.",
    async execute() {
      const store = createMemoryResearchStore();
      const project = await store.createProject({
        userId: "eval-user",
        title: "Eval MCP",
        question: EVAL_RESEARCH_QUESTION,
      });
      await store.createSource({
        projectId: project.id,
        url: "https://no-fixture-domain.example/",
        title: "Unknown",
        toolName: "search",
      });

      const failingMcp: MCPClient = {
        async connect() {},
        async disconnect() {},
        async listTools(): Promise<MCPToolDefinition[]> {
          return [];
        },
        async callTool(): Promise<ToolResult> {
          return { ok: false, error: "mcp down", retryable: true };
        },
      };

      await enrichResearchWithCompanyProfiles({
        projectId: project.id,
        store,
        mcp: failingMcp,
      });

      const sources = await store.listSources(project.id);
      const fabricated = sources.some((source) =>
        source.url.startsWith("mcp://"),
      );

      return resultFromScorer(
        "reliability.mcp-failure-no-fabrication",
        scoreFailureIsolation({
          projectStatus: "queued",
          expectedStatus: "queued",
          fabricatedSources: fabricated,
          expectFabricatedSources: false,
          hasReport: false,
          expectReport: false,
          preservedSourceCount: sources.length,
          expectPreservedSources: 1,
        }),
      );
    },
  },
];
