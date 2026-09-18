import type { ResearchStage, ResearchStatus } from "./types";

export type TraceItemStatus =
  | "success"
  | "failed"
  | "skipped"
  | "rejected"
  | "pending";

export type ResearchTraceItem = {
  id: string;
  label: string;
  status: TraceItemStatus;
  detail?: string;
  sourceId?: string;
  findingId?: string;
  url?: string;
  toolName?: string | null;
  quote?: string;
};

export type ResearchTraceStage = {
  id: ResearchStage;
  label: string;
  status: TraceItemStatus;
  summary: string;
  items: ResearchTraceItem[];
};

export type ResearchTraceFindingProvenance = {
  findingId: string;
  sourceId: string;
  claim: string;
  quote: string;
  sourceTitle: string;
  sourceUrl: string;
  toolName: string | null;
};

export type ResearchTraceCitation = {
  sourceId: string;
  url: string;
  title: string;
  citedIn: string[];
};

export type ResearchTrace = {
  projectId: string;
  status: ResearchStatus;
  errorMessage: string | null;
  stages: ResearchTraceStage[];
  provenance: {
    findings: ResearchTraceFindingProvenance[];
    citations: ResearchTraceCitation[];
  };
};

export const TRACE_STAGE_LABELS: Record<ResearchStage, string> = {
  plan: "Plan",
  search: "Search",
  retrieve: "Retrieve",
  enrich: "MCP Enrichment",
  extract: "Extract",
  verify: "Verify",
  analyse: "Analyse",
  report: "Report",
};
