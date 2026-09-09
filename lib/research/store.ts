import type { Prisma } from "@prisma/client";
import type {
  Finding,
  Message,
  MessageRole,
  Report,
  ResearchProject,
  ResearchProjectDetail,
  ResearchStatus,
  ResearchTask,
  Source,
  TaskStatus,
} from "./types";

export type JsonObject = Prisma.InputJsonValue;

export type CreateProjectInput = {
  userId: string;
  title: string;
  question: string;
};

export type CreateTaskInput = {
  projectId: string;
  title: string;
  query: string;
  sortOrder: number;
};

export type CreateSourceInput = {
  projectId: string;
  taskId?: string | null;
  url: string;
  title: string;
  snippet?: string | null;
  content?: string | null;
  contentHash?: string | null;
  httpStatus?: number | null;
  toolName?: string | null;
  fetchedAt?: Date | null;
};

export type CreateFindingInput = {
  projectId: string;
  sourceId: string;
  subject: string;
  attribute: string;
  value: string;
  quote: string;
  confidence: number;
};

export type CreateReportInput = {
  projectId: string;
  markdown: string;
  outlineJson: JsonObject;
  version?: number;
};

export type CreateMessageInput = {
  projectId: string;
  role: MessageRole;
  content: string;
  citationJson?: JsonObject | null;
};

export type UpdateTaskInput = {
  status?: TaskStatus;
  resultJson?: JsonObject | null;
};

export type UpdateSourceInput = {
  title?: string;
  content?: string | null;
  contentHash?: string | null;
  httpStatus?: number | null;
  toolName?: string | null;
  fetchedAt?: Date | null;
};

/**
 * Persistence port for research orchestration.
 * Prisma implements this in production; tests use an in-memory store.
 */
export interface ResearchStore {
  createProject(input: CreateProjectInput): Promise<ResearchProject>;
  getProject(id: string): Promise<ResearchProject | null>;
  getProjectOwnedBy(
    id: string,
    userId: string,
  ): Promise<ResearchProject | null>;
  listProjectsByUser(userId: string): Promise<ResearchProject[]>;
  transitionStatus(
    id: string,
    to: ResearchStatus,
    errorMessage?: string | null,
  ): Promise<ResearchProject>;

  createTask(input: CreateTaskInput): Promise<ResearchTask>;
  updateTask(id: string, data: UpdateTaskInput): Promise<ResearchTask>;
  listTasks(projectId: string): Promise<ResearchTask[]>;

  createSource(input: CreateSourceInput): Promise<Source>;
  updateSource(id: string, data: UpdateSourceInput): Promise<Source>;
  listSources(projectId: string): Promise<Source[]>;
  findSourceByUrl(projectId: string, url: string): Promise<Source | null>;

  createFinding(input: CreateFindingInput): Promise<Finding>;
  listFindings(projectId: string): Promise<Finding[]>;

  createReport(input: CreateReportInput): Promise<Report>;
  getLatestReport(projectId: string): Promise<Report | null>;

  createMessage(input: CreateMessageInput): Promise<Message>;
  listMessages(projectId: string): Promise<Message[]>;

  getProjectDetail(
    id: string,
    userId: string,
  ): Promise<ResearchProjectDetail | null>;
}
