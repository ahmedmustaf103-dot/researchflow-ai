import { quoteExistsInSource } from "./extract";
import { MCP_COMPANY_PROFILE_TOOL_NAME } from "@/lib/tools/mcp/schemas";
import type {
  Finding,
  Report,
  ResearchProjectDetail,
  ResearchStage,
  ResearchStatus,
  Source,
  ResearchTask,
} from "./types";
import { RESEARCH_STAGES } from "./types";
import {
  TRACE_STAGE_LABELS,
  type ResearchTrace,
  type ResearchTraceCitation,
  type ResearchTraceFindingProvenance,
  type ResearchTraceItem,
  type ResearchTraceStage,
  type TraceItemStatus,
} from "./trace-types";

type OutlineReport = {
  title?: unknown;
  executiveSummary?: unknown;
  scope?: unknown;
  keyFindings?: unknown;
  comparisons?: unknown;
  similarities?: unknown;
  differences?: unknown;
  gaps?: unknown;
  uncertainties?: unknown;
  conflicts?: unknown;
  strengthsWeaknesses?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));
}

export function isMcpSource(source: Source): boolean {
  return (
    source.url.startsWith("mcp://") ||
    source.toolName === MCP_COMPANY_PROFILE_TOOL_NAME
  );
}

export function isHttpSource(source: Source): boolean {
  return !isMcpSource(source);
}

export function isRetrievedSource(source: Source): boolean {
  if (isMcpSource(source)) {
    return false;
  }
  const content = source.content?.trim() ?? "";
  if (!content) {
    return false;
  }
  if (
    source.httpStatus !== null &&
    source.httpStatus !== undefined &&
    (source.httpStatus < 200 || source.httpStatus >= 300)
  ) {
    return false;
  }
  return true;
}

export function isFailedRetrieval(source: Source): boolean {
  if (isMcpSource(source)) {
    return false;
  }
  if (!source.fetchedAt) {
    return false;
  }
  if (isRetrievedSource(source)) {
    return false;
  }
  return true;
}

function statusRank(status: ResearchStatus): number {
  switch (status) {
    case "queued":
      return 0;
    case "planning":
      return 1;
    case "researching":
      return 2;
    case "verifying":
      return 3;
    case "analysing":
      return 4;
    case "reporting":
      return 5;
    case "completed":
      return 6;
    case "failed":
    case "cancelled":
      return -1;
    default:
      return 0;
  }
}

/** Whether the project has progressed past a given stage boundary. */
function pastStage(status: ResearchStatus, stage: ResearchStage): boolean {
  const rank = statusRank(status);
  if (rank < 0) {
    // Failed/cancelled: use data presence instead; treat as "past" if data exists.
    return false;
  }
  switch (stage) {
    case "plan":
      return rank >= 2;
    case "search":
    case "retrieve":
    case "enrich":
    case "extract":
      return rank >= 3;
    case "verify":
      return rank >= 4;
    case "analyse":
      return rank >= 5;
    case "report":
      return rank >= 6;
    default:
      return false;
  }
}

function readOutlineReport(report: Report | null): OutlineReport | null {
  if (!report?.outlineJson || !isRecord(report.outlineJson)) {
    return null;
  }
  const nested = report.outlineJson.report;
  return isRecord(nested) ? (nested as OutlineReport) : null;
}

function collectCitedSourceIds(outline: OutlineReport | null): Map<string, string[]> {
  const cited = new Map<string, string[]>();

  function add(section: string, ids: unknown) {
    if (!Array.isArray(ids)) {
      return;
    }
    for (const raw of ids) {
      const id = asString(raw);
      if (!id) {
        continue;
      }
      const existing = cited.get(id) ?? [];
      if (!existing.includes(section)) {
        existing.push(section);
      }
      cited.set(id, existing);
    }
  }

  if (!outline) {
    return cited;
  }

  if (Array.isArray(outline.keyFindings)) {
    for (const item of outline.keyFindings) {
      if (isRecord(item)) {
        add("Key findings", item.sourceIds);
      }
    }
  }
  if (Array.isArray(outline.comparisons)) {
    for (const item of outline.comparisons) {
      if (isRecord(item)) {
        add("Comparisons", item.sourceIds);
      }
    }
  }
  if (Array.isArray(outline.strengthsWeaknesses)) {
    for (const item of outline.strengthsWeaknesses) {
      if (isRecord(item)) {
        add("Strengths and weaknesses", item.sourceIds);
      }
    }
  }
  if (Array.isArray(outline.conflicts)) {
    for (const item of outline.conflicts) {
      if (isRecord(item)) {
        add("Conflicts", item.sourceIds);
      }
    }
  }

  return cited;
}

function buildPlanStage(
  tasks: ResearchTask[],
  status: ResearchStatus,
): ResearchTraceStage {
  const items: ResearchTraceItem[] = tasks.map((task) => ({
    id: task.id,
    label: task.title,
    status:
      task.status === "failed"
        ? "failed"
        : task.status === "completed"
          ? "success"
          : task.status === "running"
            ? "pending"
            : status === "failed" && task.status === "pending"
              ? "skipped"
              : "pending",
    detail: task.query,
  }));

  let stageStatus: TraceItemStatus = "pending";
  if (tasks.length > 0) {
    stageStatus = tasks.some((task) => task.status === "failed")
      ? tasks.every((task) => task.status === "failed")
        ? "failed"
        : "success"
      : "success";
  } else if (status === "failed" || status === "cancelled") {
    stageStatus = "failed";
  } else if (pastStage(status, "plan") || status === "completed") {
    stageStatus = "skipped";
  }

  return {
    id: "plan",
    label: TRACE_STAGE_LABELS.plan,
    status: stageStatus,
    summary:
      tasks.length === 0
        ? status === "failed"
          ? "No research tasks were persisted"
          : "No research tasks yet"
        : `${tasks.length} research task${tasks.length === 1 ? "" : "s"}`,
    items,
  };
}

function buildSearchStage(
  sources: Source[],
  tasks: ResearchTask[],
  status: ResearchStatus,
): ResearchTraceStage {
  const httpSources = sources.filter(isHttpSource);
  const failedTasks = tasks.filter((task) => task.status === "failed");

  const items: ResearchTraceItem[] = [
    ...httpSources.map((source) => ({
      id: source.id,
      label: source.title,
      status: "success" as const,
      detail: source.snippet ?? undefined,
      sourceId: source.id,
      url: source.url,
      toolName: source.toolName,
    })),
    ...failedTasks.map((task) => {
      const error =
        isRecord(task.resultJson) && asString(task.resultJson.error)
          ? asString(task.resultJson.error)
          : "Search task failed";
      return {
        id: `search-task-failed-${task.id}`,
        label: `Failed search: ${task.title}`,
        status: "failed" as const,
        detail: error,
      };
    }),
  ];

  let stageStatus: TraceItemStatus = "pending";
  if (httpSources.length > 0) {
    stageStatus = failedTasks.length > 0 ? "success" : "success";
  } else if (failedTasks.length > 0) {
    stageStatus = "failed";
  } else if (pastStage(status, "search") || status === "completed") {
    stageStatus = "skipped";
  } else if (status === "failed") {
    stageStatus = "failed";
  }

  const summaryParts = [
    httpSources.length > 0
      ? `${httpSources.length} persisted search source${httpSources.length === 1 ? "" : "s"}`
      : "No persisted search sources",
  ];
  if (failedTasks.length > 0) {
    summaryParts.push(
      `${failedTasks.length} failed search task${failedTasks.length === 1 ? "" : "s"}`,
    );
  }

  return {
    id: "search",
    label: TRACE_STAGE_LABELS.search,
    status: stageStatus,
    summary: summaryParts.join(" · "),
    items,
  };
}

function buildRetrieveStage(
  sources: Source[],
  status: ResearchStatus,
): ResearchTraceStage {
  const httpSources = sources.filter(isHttpSource);
  const retrieved = httpSources.filter(isRetrievedSource);
  const failed = httpSources.filter(isFailedRetrieval);
  const notAttempted = httpSources.filter(
    (source) => !isRetrievedSource(source) && !isFailedRetrieval(source),
  );

  const items: ResearchTraceItem[] = [
    ...retrieved.map((source) => ({
      id: `retrieve-ok-${source.id}`,
      label: source.title,
      status: "success" as const,
      detail:
        source.httpStatus !== null && source.httpStatus !== undefined
          ? `HTTP ${source.httpStatus}`
          : "Content retrieved",
      sourceId: source.id,
      url: source.url,
      toolName: source.toolName,
    })),
    ...failed.map((source) => ({
      id: `retrieve-fail-${source.id}`,
      label: source.title,
      status: "failed" as const,
      detail:
        source.httpStatus !== null && source.httpStatus !== undefined
          ? `Retrieval failed (HTTP ${source.httpStatus})`
          : "Retrieval failed (no content persisted)",
      sourceId: source.id,
      url: source.url,
      toolName: source.toolName,
    })),
  ];

  if (pastStage(status, "retrieve") || status === "completed") {
    for (const source of notAttempted) {
      items.push({
        id: `retrieve-skip-${source.id}`,
        label: source.title,
        status: "skipped",
        detail: "No retrieval attempt recorded for this source",
        sourceId: source.id,
        url: source.url,
        toolName: source.toolName,
      });
    }
  }

  let stageStatus: TraceItemStatus = "pending";
  if (retrieved.length > 0) {
    stageStatus = "success";
  } else if (failed.length > 0 && pastStage(status, "retrieve")) {
    stageStatus = "failed";
  } else if (
    (pastStage(status, "retrieve") || status === "completed") &&
    retrieved.length === 0 &&
    failed.length === 0
  ) {
    stageStatus = "skipped";
  } else if (status === "failed" && httpSources.length === 0) {
    stageStatus = "failed";
  }

  const summaryParts: string[] = [];
  if (retrieved.length > 0) {
    summaryParts.push(
      `${retrieved.length} page${retrieved.length === 1 ? "" : "s"} retrieved`,
    );
  }
  if (failed.length > 0) {
    summaryParts.push(
      `${failed.length} known retrieval failure${failed.length === 1 ? "" : "s"}`,
    );
  }
  if (summaryParts.length === 0) {
    summaryParts.push(
      pastStage(status, "retrieve") || status === "completed"
        ? "No page retrieval recorded"
        : "No page retrieval yet",
    );
  }

  return {
    id: "retrieve",
    label: TRACE_STAGE_LABELS.retrieve,
    status: stageStatus,
    summary: summaryParts.join(" · "),
    items,
  };
}

function buildEnrichStage(
  sources: Source[],
  status: ResearchStatus,
): ResearchTraceStage {
  const mcpSources = sources.filter(isMcpSource);
  const items: ResearchTraceItem[] = mcpSources.map((source) => ({
    id: source.id,
    label: source.title,
    status: "success",
    detail: source.snippet ?? "MCP company profile",
    sourceId: source.id,
    url: source.url,
    toolName: source.toolName,
  }));

  let stageStatus: TraceItemStatus = "pending";
  if (mcpSources.length > 0) {
    stageStatus = "success";
  } else if (
    pastStage(status, "enrich") ||
    status === "completed" ||
    status === "failed" ||
    status === "cancelled"
  ) {
    stageStatus = "skipped";
  }

  return {
    id: "enrich",
    label: TRACE_STAGE_LABELS.enrich,
    status: stageStatus,
    summary:
      mcpSources.length > 0
        ? `${mcpSources.length} MCP company profile${mcpSources.length === 1 ? "" : "s"}`
        : "No MCP enrichment recorded",
    items:
      mcpSources.length > 0
        ? items
        : [
            {
              id: "enrich-none",
              label: "No MCP enrichment recorded",
              status: stageStatus === "pending" ? "pending" : "skipped",
              detail:
                "Failed MCP lookups are not persisted, so this trace only shows successful profiles.",
            },
          ],
  };
}

function buildExtractStage(
  findings: Finding[],
  sourcesById: Map<string, Source>,
  status: ResearchStatus,
): ResearchTraceStage {
  const items: ResearchTraceItem[] = findings.map((finding) => {
    const source = sourcesById.get(finding.sourceId);
    return {
      id: finding.id,
      label: finding.value,
      status: "success",
      detail: finding.attribute,
      findingId: finding.id,
      sourceId: finding.sourceId,
      url: source?.url,
      toolName: source?.toolName ?? null,
      quote: finding.quote,
    };
  });

  let stageStatus: TraceItemStatus = "pending";
  if (findings.length > 0) {
    stageStatus = "success";
  } else if (pastStage(status, "extract") || status === "completed") {
    stageStatus = "skipped";
  } else if (status === "failed") {
    stageStatus = "skipped";
  }

  return {
    id: "extract",
    label: TRACE_STAGE_LABELS.extract,
    status: stageStatus,
    summary:
      findings.length > 0
        ? `${findings.length} evidence finding${findings.length === 1 ? "" : "s"}`
        : "No evidence findings recorded",
    items,
  };
}

function buildVerifyStage(
  findings: Finding[],
  sourcesById: Map<string, Source>,
  status: ResearchStatus,
): ResearchTraceStage {
  if (findings.length === 0) {
    const emptyStatus: TraceItemStatus =
      pastStage(status, "verify") ||
      status === "completed" ||
      status === "failed" ||
      status === "cancelled"
        ? "skipped"
        : "pending";
    return {
      id: "verify",
      label: TRACE_STAGE_LABELS.verify,
      status: emptyStatus,
      summary: "No persisted findings to verify",
      items: [
        {
          id: "verify-none",
          label: "No verification detail recorded",
          status: emptyStatus,
          detail:
            "Rejected quotes are not persisted. Only findings that passed extract-time quote support are stored.",
        },
      ],
    };
  }

  const items: ResearchTraceItem[] = findings.map((finding) => {
    const source = sourcesById.get(finding.sourceId);
    const content = source?.content ?? "";
    const supported =
      finding.quote.trim().length > 0 &&
      (content
        ? quoteExistsInSource(finding.quote, content)
        : finding.quote.trim().length > 0);

    return {
      id: `verify-${finding.id}`,
      label: finding.value,
      status: supported ? "success" : "rejected",
      detail: content
        ? supported
          ? "Quote matches persisted source content"
          : "Quote does not match currently persisted source content"
        : "Persisted finding has a quote; source content unavailable for re-check",
      findingId: finding.id,
      sourceId: finding.sourceId,
      quote: finding.quote,
      url: source?.url,
      toolName: source?.toolName ?? null,
    };
  });

  return {
    id: "verify",
    label: TRACE_STAGE_LABELS.verify,
    status: "success",
    summary:
      "Persisted findings are quote-backed by the extraction validation. Rejected quote counts are not recorded.",
    items,
  };
}

function buildAnalyseStage(
  outline: OutlineReport | null,
  status: ResearchStatus,
  hasReport: boolean,
): ResearchTraceStage {
  const items: ResearchTraceItem[] = [];

  if (outline) {
    const summary = asString(outline.executiveSummary);
    if (summary) {
      items.push({
        id: "analyse-summary",
        label: "Executive summary",
        status: "success",
        detail: summary,
      });
    }

    if (Array.isArray(outline.comparisons)) {
      for (const [index, raw] of outline.comparisons.entries()) {
        if (!isRecord(raw)) {
          continue;
        }
        const dimension = asString(raw.dimension) ?? `Comparison ${index + 1}`;
        const points = asStringArray(raw.points);
        items.push({
          id: `analyse-comparison-${index}`,
          label: dimension,
          status: "success",
          detail: points.length > 0 ? points.join(" · ") : undefined,
        });
      }
    }

    const similarities = asStringArray(outline.similarities);
    if (similarities.length > 0) {
      items.push({
        id: "analyse-similarities",
        label: "Similarities",
        status: "success",
        detail: similarities.join(" · "),
      });
    }

    const differences = asStringArray(outline.differences);
    if (differences.length > 0) {
      items.push({
        id: "analyse-differences",
        label: "Differences",
        status: "success",
        detail: differences.join(" · "),
      });
    }

    const uncertainties = asStringArray(outline.uncertainties);
    if (uncertainties.length > 0) {
      items.push({
        id: "analyse-uncertainties",
        label: "Uncertainties",
        status: "success",
        detail: uncertainties.join(" · "),
      });
    }

    if (Array.isArray(outline.conflicts)) {
      for (const [index, raw] of outline.conflicts.entries()) {
        if (!isRecord(raw)) {
          continue;
        }
        const topic = asString(raw.topic) ?? `Conflict ${index + 1}`;
        const statements = asStringArray(raw.statements);
        items.push({
          id: `analyse-conflict-${index}`,
          label: topic,
          status: "success",
          detail: statements.join(" · "),
        });
      }
    }
  }

  let stageStatus: TraceItemStatus = "pending";
  if (items.length > 0) {
    stageStatus = "success";
  } else if (hasReport) {
    stageStatus = "success";
  } else if (status === "failed" || status === "cancelled") {
    stageStatus = "failed";
  } else if (pastStage(status, "analyse") || status === "completed") {
    stageStatus = "skipped";
  }

  return {
    id: "analyse",
    label: TRACE_STAGE_LABELS.analyse,
    status: stageStatus,
    summary:
      items.length > 0
        ? `Structured analysis available (${items.length} section${items.length === 1 ? "" : "s"})`
        : hasReport
          ? "Report exists; structured analysis sections not found in outlineJson"
          : "No structured analysis recorded",
    items,
  };
}

function buildReportStage(
  report: Report | null,
  outline: OutlineReport | null,
  citations: ResearchTraceCitation[],
  status: ResearchStatus,
): ResearchTraceStage {
  if (report) {
    const title = asString(outline?.title) ?? "Citation-backed report";
    const items: ResearchTraceItem[] = [
      {
        id: report.id,
        label: title,
        status: "success",
        detail: `Version ${report.version}`,
      },
      ...citations.map((citation) => ({
        id: `citation-${citation.sourceId}`,
        label: citation.title,
        status: "success" as const,
        detail: `Cited in: ${citation.citedIn.join(", ")}`,
        sourceId: citation.sourceId,
        url: citation.url,
      })),
    ];

    return {
      id: "report",
      label: TRACE_STAGE_LABELS.report,
      status: "success",
      summary: `Citation-backed report generated · ${citations.length} cited source${citations.length === 1 ? "" : "s"}`,
      items,
    };
  }

  let stageStatus: TraceItemStatus = "pending";
  if (status === "failed" || status === "cancelled") {
    stageStatus = "failed";
  } else if (status === "completed") {
    stageStatus = "skipped";
  }

  return {
    id: "report",
    label: TRACE_STAGE_LABELS.report,
    status: stageStatus,
    summary:
      stageStatus === "failed"
        ? "No report was persisted"
        : "Report not generated yet",
    items: [
      {
        id: "report-none",
        label: "No report recorded",
        status: stageStatus,
      },
    ],
  };
}

function buildProvenance(
  findings: Finding[],
  sources: Source[],
  outline: OutlineReport | null,
): ResearchTrace["provenance"] {
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const projectSourceIds = new Set(sources.map((source) => source.id));

  const findingProvenance: ResearchTraceFindingProvenance[] = [];
  for (const finding of findings) {
    const source = sourcesById.get(finding.sourceId);
    if (!source || !projectSourceIds.has(source.id)) {
      continue;
    }
    findingProvenance.push({
      findingId: finding.id,
      sourceId: source.id,
      claim: finding.value,
      quote: finding.quote,
      sourceTitle: source.title,
      sourceUrl: source.url,
      toolName: source.toolName,
    });
  }

  const citedMap = collectCitedSourceIds(outline);
  const citations: ResearchTraceCitation[] = [];
  for (const [sourceId, citedIn] of citedMap) {
    if (!projectSourceIds.has(sourceId)) {
      continue;
    }
    const source = sourcesById.get(sourceId);
    if (!source) {
      continue;
    }
    citations.push({
      sourceId: source.id,
      url: source.url,
      title: source.title,
      citedIn,
    });
  }

  return { findings: findingProvenance, citations };
}

/**
 * Derive a recruiter-friendly Research Trace from persisted project detail.
 * Pure function — does not invent unpersisted events or counts.
 */
export function buildResearchTrace(detail: ResearchProjectDetail): ResearchTrace {
  const { project, status, tasks, sources, findings, report } = detail;
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const outline = readOutlineReport(report);
  const provenance = buildProvenance(findings, sources, outline);

  const stages: ResearchTraceStage[] = [
    buildPlanStage(tasks, status),
    buildSearchStage(sources, tasks, status),
    buildRetrieveStage(sources, status),
    buildEnrichStage(sources, status),
    buildExtractStage(findings, sourcesById, status),
    buildVerifyStage(findings, sourcesById, status),
    buildAnalyseStage(outline, status, Boolean(report)),
    buildReportStage(report, outline, provenance.citations, status),
  ];

  // Ensure stage order matches RESEARCH_STAGES.
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const ordered = RESEARCH_STAGES.map((id) => byId.get(id)!);

  return {
    projectId: project.id,
    status,
    errorMessage: project.errorMessage ?? null,
    stages: ordered,
    provenance,
  };
}
