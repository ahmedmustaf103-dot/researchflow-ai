import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ResearchNotFoundError } from "@/lib/research/errors";
import { assertCanTransition } from "@/lib/research/status";
import type {
  CreateFindingInput,
  CreateMessageInput,
  CreateProjectInput,
  CreateReportInput,
  CreateSourceInput,
  CreateTaskInput,
  ResearchStore,
  UpdateSourceInput,
  UpdateTaskInput,
} from "@/lib/research/store";
import type { ResearchProjectDetail } from "@/lib/research/types";

export function createPrismaResearchStore(
  db: PrismaClient = prisma,
): ResearchStore {
  return {
    async createProject(input: CreateProjectInput) {
      return db.researchProject.create({
        data: {
          userId: input.userId,
          title: input.title,
          question: input.question,
        },
      });
    },

    async getProject(id) {
      return db.researchProject.findUnique({ where: { id } });
    },

    async getProjectOwnedBy(id, userId) {
      return db.researchProject.findFirst({
        where: { id, userId },
      });
    },

    async listProjectsByUser(userId) {
      return db.researchProject.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
    },

    async transitionStatus(id, to, errorMessage = null) {
      const current = await db.researchProject.findUnique({ where: { id } });
      if (!current) {
        throw new ResearchNotFoundError(id);
      }

      assertCanTransition(current.status, to);

      return db.researchProject.update({
        where: { id },
        data: {
          status: to,
          errorMessage,
        },
      });
    },

    async createTask(input: CreateTaskInput) {
      return db.researchTask.create({
        data: {
          projectId: input.projectId,
          title: input.title,
          query: input.query,
          sortOrder: input.sortOrder,
        },
      });
    },

    async updateTask(id, data: UpdateTaskInput) {
      return db.researchTask.update({
        where: { id },
        data: {
          status: data.status,
          resultJson:
            data.resultJson === undefined
              ? undefined
              : data.resultJson === null
                ? Prisma.JsonNull
                : (data.resultJson as Prisma.InputJsonValue),
        },
      });
    },

    async listTasks(projectId) {
      return db.researchTask.findMany({
        where: { projectId },
        orderBy: { sortOrder: "asc" },
      });
    },

    async createSource(input: CreateSourceInput) {
      const existing = await db.source.findUnique({
        where: {
          projectId_url: {
            projectId: input.projectId,
            url: input.url,
          },
        },
      });

      if (existing) {
        return existing;
      }

      return db.source.create({
        data: {
          projectId: input.projectId,
          taskId: input.taskId ?? null,
          url: input.url,
          title: input.title,
          snippet: input.snippet ?? null,
          content: input.content ?? null,
          contentHash: input.contentHash ?? null,
          httpStatus: input.httpStatus ?? null,
          toolName: input.toolName ?? null,
          fetchedAt: input.fetchedAt ?? null,
        },
      });
    },

    async updateSource(id, data: UpdateSourceInput) {
      return db.source.update({
        where: { id },
        data,
      });
    },

    async listSources(projectId) {
      return db.source.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
      });
    },

    async findSourceByUrl(projectId, url) {
      return db.source.findUnique({
        where: {
          projectId_url: { projectId, url },
        },
      });
    },

    async createFinding(input: CreateFindingInput) {
      return db.finding.create({
        data: input,
      });
    },

    async listFindings(projectId) {
      return db.finding.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
      });
    },

    async createReport(input: CreateReportInput) {
      const latest = await db.report.findFirst({
        where: { projectId: input.projectId },
        orderBy: { version: "desc" },
      });

      return db.report.create({
        data: {
          projectId: input.projectId,
          markdown: input.markdown,
          outlineJson: input.outlineJson as Prisma.InputJsonValue,
          version: input.version ?? (latest ? latest.version + 1 : 1),
        },
      });
    },

    async getLatestReport(projectId) {
      return db.report.findFirst({
        where: { projectId },
        orderBy: { version: "desc" },
      });
    },

    async createMessage(input: CreateMessageInput) {
      return db.message.create({
        data: {
          projectId: input.projectId,
          role: input.role,
          content: input.content,
          citationJson: input.citationJson as Prisma.InputJsonValue | undefined,
        },
      });
    },

    async listMessages(projectId) {
      return db.message.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
      });
    },

    async getProjectDetail(
      id,
      userId,
    ): Promise<ResearchProjectDetail | null> {
      const project = await db.researchProject.findFirst({
        where: { id, userId },
        include: {
          tasks: { orderBy: { sortOrder: "asc" } },
          sources: { orderBy: { createdAt: "asc" } },
          findings: { orderBy: { createdAt: "asc" } },
          reports: { orderBy: { version: "desc" }, take: 1 },
        },
      });

      if (!project) {
        return null;
      }

      return {
        project,
        status: project.status,
        tasks: project.tasks,
        sources: project.sources,
        findings: project.findings,
        report: project.reports[0] ?? null,
      };
    },
  };
}
