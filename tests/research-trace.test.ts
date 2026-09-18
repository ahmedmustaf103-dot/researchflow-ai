import { describe, expect, it } from "vitest";
import { MCP_COMPANY_PROFILE_TOOL_NAME } from "@/lib/tools/mcp/schemas";
import {
  buildResearchTrace,
  isFailedRetrieval,
  isMcpSource,
  isRetrievedSource,
} from "@/lib/research/trace";
import type {
  Finding,
  Report,
  ResearchProject,
  ResearchProjectDetail,
  ResearchTask,
  Source,
} from "@/lib/research/types";
import { RESEARCH_STAGES } from "@/lib/research/types";

function project(
  overrides: Partial<ResearchProject> = {},
): ResearchProject {
  return {
    id: "proj_trace",
    userId: "user-1",
    title: "Payment platforms",
    question: "Compare Stripe, Adyen and PayPal",
    status: "completed",
    errorMessage: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function task(overrides: Partial<ResearchTask> = {}): ResearchTask {
  return {
    id: "task_1",
    projectId: "proj_trace",
    title: "Map pricing",
    query: "Stripe Adyen PayPal pricing",
    status: "completed",
    sortOrder: 1,
    resultJson: { resultCount: 2, persistedCount: 2 },
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function source(overrides: Partial<Source> = {}): Source {
  return {
    id: "src_1",
    projectId: "proj_trace",
    taskId: "task_1",
    url: "https://example.test/stripe",
    title: "Stripe notes",
    snippet: "snippet",
    content: "Stripe charges 2.9% + 30¢ per successful card charge.",
    contentHash: "hash",
    httpStatus: 200,
    toolName: "fetch_page",
    fetchedAt: new Date("2024-01-01T00:00:00.000Z"),
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "find_1",
    projectId: "proj_trace",
    sourceId: "src_1",
    subject: "evidence",
    attribute: "pricing",
    value: "Stripe uses a blended rate",
    quote: "Stripe charges 2.9% + 30¢ per successful card charge.",
    confidence: 1,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: "rep_1",
    projectId: "proj_trace",
    markdown: "# Report\n\n## Sources\n1. [Stripe notes](https://example.test/stripe)",
    outlineJson: {
      sections: ["Executive summary", "Key findings", "Sources"],
      report: {
        title: "Payment comparison",
        executiveSummary: "Fixture summary comparing payment platforms.",
        scope: "Fixture scope",
        keyFindings: [
          {
            text: "Stripe publishes a blended rate",
            sourceIds: ["src_1", "src_invented"],
          },
        ],
        comparisons: [
          {
            dimension: "pricing",
            points: ["Blended vs interchange++"],
            sourceIds: ["src_1", "src_mcp"],
          },
        ],
        strengthsWeaknesses: [],
        gaps: ["No live fees"],
        uncertainties: ["Enterprise discounts unknown"],
        conflicts: [
          {
            topic: "Pricing presentation",
            statements: ["Blended rate", "Interchange++"],
            sourceIds: ["src_1"],
          },
        ],
      },
    },
    version: 1,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function detail(
  overrides: Partial<ResearchProjectDetail> = {},
): ResearchProjectDetail {
  return {
    project: project(),
    status: "completed",
    tasks: [task(), task({ id: "task_2", title: "Products", sortOrder: 2 })],
    sources: [
      source(),
      source({
        id: "src_fail",
        url: "https://example.test/fail",
        title: "Failed page",
        content: null,
        httpStatus: 502,
        toolName: "search",
        fetchedAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
      source({
        id: "src_mcp",
        url: "mcp://company-profile/stripe.com",
        title: "Stripe",
        snippet: "Fixture MCP profile",
        content: "# Stripe\nFixture profile",
        httpStatus: 200,
        toolName: MCP_COMPANY_PROFILE_TOOL_NAME,
        fetchedAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    ],
    findings: [finding()],
    report: report(),
    ...overrides,
  };
}

describe("research trace helpers", () => {
  it("detects MCP, retrieved, and failed retrieval sources", () => {
    const mcp = source({
      url: "mcp://company-profile/adyen.com",
      toolName: MCP_COMPANY_PROFILE_TOOL_NAME,
    });
    const ok = source();
    const failed = source({
      content: null,
      httpStatus: 502,
      fetchedAt: new Date(),
    });

    expect(isMcpSource(mcp)).toBe(true);
    expect(isRetrievedSource(ok)).toBe(true);
    expect(isFailedRetrieval(failed)).toBe(true);
    expect(isFailedRetrieval(ok)).toBe(false);
  });
});

describe("buildResearchTrace", () => {
  it("produces all expected stages for a completed project", () => {
    const trace = buildResearchTrace(detail());
    expect(trace.stages.map((stage) => stage.id)).toEqual([...RESEARCH_STAGES]);
    expect(trace.status).toBe("completed");
    expect(trace.errorMessage).toBeNull();
  });

  it("exposes project errors on failed projects", () => {
    const trace = buildResearchTrace(
      detail({
        project: project({
          status: "failed",
          errorMessage: "Analysis failed",
        }),
        status: "failed",
        report: null,
      }),
    );

    expect(trace.errorMessage).toBe("Analysis failed");
    expect(trace.stages.find((stage) => stage.id === "report")?.status).toBe(
      "failed",
    );
  });

  it("lists tasks under Plan", () => {
    const trace = buildResearchTrace(detail());
    const plan = trace.stages.find((stage) => stage.id === "plan");
    expect(plan?.summary).toContain("2 research tasks");
    expect(plan?.items.map((item) => item.label)).toEqual([
      "Map pricing",
      "Products",
    ]);
  });

  it("lists search sources under Search", () => {
    const trace = buildResearchTrace(detail());
    const search = trace.stages.find((stage) => stage.id === "search");
    expect(search?.items.some((item) => item.url === "https://example.test/stripe")).toBe(
      true,
    );
    expect(search?.items.some((item) => item.url?.startsWith("mcp://"))).toBe(
      false,
    );
  });

  it("distinguishes retrieved sources from failed retrievals", () => {
    const trace = buildResearchTrace(detail());
    const retrieve = trace.stages.find((stage) => stage.id === "retrieve");
    expect(retrieve?.summary).toMatch(/retrieved/);
    expect(retrieve?.summary).toMatch(/failure/);
    expect(
      retrieve?.items.find((item) => item.id.startsWith("retrieve-ok-"))?.status,
    ).toBe("success");
    expect(
      retrieve?.items.find((item) => item.id.startsWith("retrieve-fail-"))
        ?.status,
    ).toBe("failed");
  });

  it("lists MCP sources under Enrich", () => {
    const trace = buildResearchTrace(detail());
    const enrich = trace.stages.find((stage) => stage.id === "enrich");
    expect(enrich?.status).toBe("success");
    expect(enrich?.items.some((item) => item.url?.startsWith("mcp://"))).toBe(
      true,
    );
  });

  it("uses an honest skipped state when no MCP sources exist", () => {
    const trace = buildResearchTrace(
      detail({
        sources: [source(), source({ id: "src_fail", content: null, httpStatus: 502 })],
      }),
    );
    const enrich = trace.stages.find((stage) => stage.id === "enrich");
    expect(enrich?.status).toBe("skipped");
    expect(enrich?.summary).toBe("No MCP enrichment recorded");
    expect(enrich?.items[0]?.detail).toMatch(/not persisted/i);
  });

  it("links findings to their correct sources in provenance", () => {
    const trace = buildResearchTrace(detail());
    expect(trace.provenance.findings).toHaveLength(1);
    expect(trace.provenance.findings[0]).toMatchObject({
      findingId: "find_1",
      sourceId: "src_1",
      sourceUrl: "https://example.test/stripe",
      toolName: "fetch_page",
    });
  });

  it("links report citations only to project sources", () => {
    const trace = buildResearchTrace(detail());
    const ids = trace.provenance.citations.map((citation) => citation.sourceId);
    expect(ids).toContain("src_1");
    expect(ids).toContain("src_mcp");
    expect(ids).not.toContain("src_invented");
  });

  it("never includes invented or foreign source IDs in provenance", () => {
    const trace = buildResearchTrace(
      detail({
        findings: [
          finding(),
          finding({
            id: "find_foreign",
            sourceId: "src_not_in_project",
            quote: "Foreign quote",
          }),
        ],
      }),
    );

    expect(
      trace.provenance.findings.every((item) =>
        ["src_1", "src_fail", "src_mcp"].includes(item.sourceId),
      ),
    ).toBe(true);
    expect(
      trace.provenance.findings.some(
        (item) => item.sourceId === "src_not_in_project",
      ),
    ).toBe(false);
  });

  it("does not invent rejected quote counts in Verify", () => {
    const trace = buildResearchTrace(detail());
    const verify = trace.stages.find((stage) => stage.id === "verify");
    expect(verify?.summary).toMatch(/not recorded/i);
    expect(verify?.summary.toLowerCase()).not.toMatch(/\d+ rejected/);
  });

  it("does not mark Report success when no report exists", () => {
    const trace = buildResearchTrace(
      detail({
        status: "analysing",
        project: project({ status: "analysing" }),
        report: null,
      }),
    );
    const reportStage = trace.stages.find((stage) => stage.id === "report");
    expect(reportStage?.status).toBe("pending");
    expect(reportStage?.status).not.toBe("success");
  });

  it("marks pending stages for incomplete projects", () => {
    const trace = buildResearchTrace(
      detail({
        status: "planning",
        project: project({ status: "planning" }),
        tasks: [],
        sources: [],
        findings: [],
        report: null,
      }),
    );

    expect(trace.stages.find((stage) => stage.id === "plan")?.status).toBe(
      "pending",
    );
    expect(trace.stages.find((stage) => stage.id === "search")?.status).toBe(
      "pending",
    );
    expect(trace.stages.find((stage) => stage.id === "report")?.status).toBe(
      "pending",
    );
  });

  it("surfaces failed search tasks without inventing discard counts", () => {
    const trace = buildResearchTrace(
      detail({
        tasks: [
          task({
            id: "task_fail",
            status: "failed",
            resultJson: { error: "Search unavailable" },
          }),
        ],
        sources: [],
        findings: [],
        report: null,
        status: "failed",
        project: project({ status: "failed", errorMessage: "All searches failed" }),
      }),
    );

    const search = trace.stages.find((stage) => stage.id === "search");
    expect(search?.status).toBe("failed");
    expect(search?.items.some((item) => item.status === "failed")).toBe(true);
    expect(search?.summary.toLowerCase()).not.toContain("discard");
  });
});
