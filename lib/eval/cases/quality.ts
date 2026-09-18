import { createMockLLMProvider } from "@/lib/ai/mock";
import { analyseResearch } from "@/lib/research/analyse";
import { clampAndNormalizePlan } from "@/lib/research/plan";
import { createMemoryResearchStore } from "@/lib/research/memory-store";
import { enrichResearchWithCompanyProfiles } from "@/lib/research/enrich";
import { runResearchPipeline } from "@/lib/research/pipeline";
import { createQueuedProject } from "@/lib/research/service";
import { createMockToolRegistry } from "@/lib/tools/mock-registry";
import type { MCPClient, MCPToolDefinition } from "@/lib/tools/mcp";
import type { ToolResult } from "@/lib/tools/types";
import type { Finding } from "@/lib/research/types";
import { scorePlanConstraints } from "../scorers/plan";
import {
  scoreHallucinatedQuoteRejection,
  scoreQuoteSupport,
} from "../scorers/extract";
import { scoreCitationHygiene } from "../scorers/citations";
import {
  scoreConflictDetection,
  scorePipelineOutcome,
} from "../scorers/pipeline";
import { scoreFailureIsolation } from "../scorers/reliability";
import {
  allChecksPassed,
  type EvalCase,
  type EvalResult,
} from "../types";
import {
  EVAL_RESEARCH_QUESTION,
  fixtureAttemptedFindings,
  fixtureConflictAnalysis,
  fixtureDirtyReport,
  fixtureHallucinatedQuote,
  fixturePlanGoal,
  fixturePlanTasks,
  fixtureSourceA,
  fixtureSourceB,
  fixtureSourceC,
  fixtureSources,
  opposingFindingA,
  opposingFindingB,
} from "./fixtures";

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

export const qualityEvalCases: EvalCase[] = [
  {
    id: "plan.constraints",
    title: "Planning constraints",
    category: "quality",
    description:
      "Fixture plan must satisfy task-count, non-empty fields, and sortOrder rules.",
    execute() {
      const tasks = clampAndNormalizePlan({
        goal: fixturePlanGoal,
        dimensions: ["pricing", "products", "customers"],
        tasks: [
          ...fixturePlanTasks,
          {
            title: "Extra task 4",
            query: "extra 4",
            sortOrder: 99,
          },
          {
            title: "Extra task 5",
            query: "extra 5",
            sortOrder: 100,
          },
          {
            title: "Extra task 6",
            query: "extra 6",
            sortOrder: 101,
          },
          {
            title: "Extra task 7",
            query: "extra 7",
            sortOrder: 102,
          },
        ],
      });

      return resultFromScorer(
        "plan.constraints",
        scorePlanConstraints({ goal: fixturePlanGoal, tasks }),
      );
    },
  },
  {
    id: "extract.quote-support",
    title: "Quote support rate",
    category: "quality",
    description:
      "Measure supported vs unsupported quotes against fixture source content.",
    execute() {
      const content = [
        fixtureSourceA.content,
        fixtureSourceB.content,
        fixtureSourceC.content,
      ].join("\n\n");

      const scored = scoreQuoteSupport({
        content,
        findings: fixtureAttemptedFindings,
        sourceId: "src_eval_mixed",
      });

      return {
        caseId: "extract.quote-support",
        passed:
          allChecksPassed(scored.checks) &&
          scored.metrics.quoteSupportRate === 0.6,
        checks: [
          ...scored.checks,
          {
            id: "extract.quote_support_rate_value",
            description:
              "quoteSupportRate must equal supported/attempted (3/5 = 0.6)",
            expected: 0.6,
            actual: scored.metrics.quoteSupportRate,
            passed: scored.metrics.quoteSupportRate === 0.6,
          },
        ],
        metrics: scored.metrics,
      };
    },
  },
  {
    id: "extract.hallucinated-quote",
    title: "Hallucinated quote rejection",
    category: "quality",
    description:
      "A quote that does not appear in fixture content must be rejected.",
    execute() {
      return resultFromScorer(
        "extract.hallucinated-quote",
        scoreHallucinatedQuoteRejection({
          content: fixtureSourceC.content ?? "",
          hallucinatedQuote: fixtureHallucinatedQuote,
        }),
      );
    },
  },
  {
    id: "citations.hygiene",
    title: "Citation hygiene",
    category: "quality",
    description:
      "Invented source IDs and URLs must be rejected; valid IDs kept.",
    execute() {
      return resultFromScorer(
        "citations.hygiene",
        scoreCitationHygiene({
          sources: fixtureSources,
          candidateIds: [
            fixtureSourceA.id,
            fixtureSourceB.id,
            "src_invented",
            "https://hallucinated.example/x",
          ],
          inventedIds: ["src_invented", "S999", "src_fake"],
          inventedUrls: ["https://hallucinated.example/x"],
          report: fixtureDirtyReport,
        }),
      );
    },
  },
  {
    id: "conflicts.opposing-evidence",
    title: "Conflict detection from opposing fixtures",
    category: "quality",
    description:
      "Mock analysis over opposing fixture findings must report a conflict.",
    async execute() {
      const findings: Finding[] = [
        {
          id: "find_a",
          projectId: "proj_eval",
          sourceId: opposingFindingA.sourceId,
          subject: opposingFindingA.subject,
          attribute: opposingFindingA.attribute,
          value: opposingFindingA.value,
          quote: opposingFindingA.quote,
          confidence: 1,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
        },
        {
          id: "find_b",
          projectId: "proj_eval",
          sourceId: opposingFindingB.sourceId,
          subject: opposingFindingB.subject,
          attribute: opposingFindingB.attribute,
          value: opposingFindingB.value,
          quote: opposingFindingB.quote,
          confidence: 1,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
        },
      ];

      const analysis = await analyseResearch({
        question: EVAL_RESEARCH_QUESTION,
        findings,
        sources: fixtureSources,
        llm: createMockLLMProvider({
          analysis: fixtureConflictAnalysis,
        }),
      });

      return resultFromScorer(
        "conflicts.opposing-evidence",
        scoreConflictDetection({
          analysisConflicts: analysis.conflicts,
          expectConflict: true,
        }),
      );
    },
  },
  {
    id: "mcp.failure-isolation",
    title: "MCP failure isolation",
    category: "quality",
    description:
      "When MCP lookup fails, no fabricated mcp:// company Source is created.",
    async execute() {
      const store = createMemoryResearchStore();
      const project = await store.createProject({
        userId: "eval-user",
        title: "Eval MCP failure",
        question: EVAL_RESEARCH_QUESTION,
      });
      await store.createSource({
        projectId: project.id,
        url: "https://unknown-eval.example/",
        title: "Unknown fixture domain",
        toolName: "search",
      });

      const failingMcp: MCPClient = {
        async connect() {},
        async disconnect() {},
        async listTools(): Promise<MCPToolDefinition[]> {
          return [];
        },
        async callTool(): Promise<ToolResult> {
          return {
            ok: false,
            error: "eval fixture MCP transport failure",
            retryable: true,
          };
        },
      };

      await enrichResearchWithCompanyProfiles({
        projectId: project.id,
        store,
        mcp: failingMcp,
      });

      const sources = await store.listSources(project.id);
      const urls = sources.map((source) => source.url);
      const fabricated = urls.some((url) => url.startsWith("mcp://"));

      return resultFromScorer(
        "mcp.failure-isolation",
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
        [
          {
            id: "mcp.existing_source_preserved",
            description: "Pre-existing research Source remains after MCP failure",
            expected: true,
            actual: urls.includes("https://unknown-eval.example/"),
            passed: urls.includes("https://unknown-eval.example/"),
          },
        ],
      );
    },
  },
  {
    id: "pipeline.failure-isolation",
    title: "Hard analysis failure isolation",
    category: "quality",
    description:
      "When analysis fails, the project fails and no report is persisted.",
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
        "pipeline.failure-isolation",
        scorePipelineOutcome({
          executedStages: result.executedStages,
          status: result.status,
          expectedStatus: "failed",
          expectReport: false,
          hasReport: Boolean(detail?.report),
        }),
      );
    },
  },
];
