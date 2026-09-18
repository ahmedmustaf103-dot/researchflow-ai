import type {
  Finding as PrismaFinding,
  Message as PrismaMessage,
  Report as PrismaReport,
  ResearchProject as PrismaResearchProject,
  ResearchTask as PrismaResearchTask,
  Source as PrismaSource,
} from "@prisma/client";

export type ResearchStatus =
  | "queued"
  | "planning"
  | "researching"
  | "verifying"
  | "analysing"
  | "reporting"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskStatus = "pending" | "running" | "completed" | "failed";

export type MessageRole = "user" | "assistant";

export type ResearchProject = PrismaResearchProject;
export type ResearchTask = PrismaResearchTask;
export type Source = PrismaSource;
export type Finding = PrismaFinding;
export type Report = PrismaReport;
export type Message = PrismaMessage;

export const RESEARCH_STAGES = [
  "plan",
  "search",
  "retrieve",
  "enrich",
  "extract",
  "verify",
  "analyse",
  "report",
] as const;

export type ResearchStage = (typeof RESEARCH_STAGES)[number];

export const TERMINAL_RESEARCH_STATUSES = [
  "completed",
  "failed",
  "cancelled",
] as const satisfies readonly ResearchStatus[];

export type TerminalResearchStatus = (typeof TERMINAL_RESEARCH_STATUSES)[number];

export type ResearchProjectDetail = {
  project: ResearchProject;
  status: ResearchStatus;
  tasks: ResearchTask[];
  sources: Source[];
  findings: Finding[];
  report: Report | null;
};

export type SearchHit = {
  url: string;
  title: string;
  snippet: string;
  publishedAt?: string;
  score?: number;
};

export type FetchedPage = {
  url: string;
  title: string;
  content: string;
  httpStatus: number;
};

export type PlannedTask = {
  title: string;
  query: string;
  sortOrder: number;
};

export type ExtractedFinding = {
  subject: string;
  attribute: string;
  value: string;
  quote: string;
  confidence: number;
};

export type VerificationNote = {
  findingId: string;
  supported: boolean;
  reason: string;
};

export type AnalysisResult = {
  summary: string;
  comparisons: Array<{
    dimension: string;
    points: string[];
  }>;
  similarities: string[];
  differences: string[];
  gaps: string[];
  uncertainties: string[];
  conflicts: Array<{
    topic: string;
    statements: string[];
  }>;
};

export type GeneratedReport = {
  markdown: string;
  outline: {
    sections: string[];
    report?: unknown;
  };
};
