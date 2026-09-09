import { ResearchNotFoundError } from "./errors";
import { assertCanTransition } from "./status";
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
} from "./store";
import type {
  Finding,
  Message,
  Report,
  ResearchProject,
  ResearchProjectDetail,
  ResearchTask,
  Source,
} from "./types";

function now(): Date {
  return new Date();
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createMemoryResearchStore(): ResearchStore {
  const projects = new Map<string, ResearchProject>();
  const tasks = new Map<string, ResearchTask>();
  const sources = new Map<string, Source>();
  const findings = new Map<string, Finding>();
  const reports = new Map<string, Report>();
  const messages = new Map<string, Message>();

  const store: ResearchStore = {
    async createProject(input: CreateProjectInput) {
      const createdAt = now();
      const project: ResearchProject = {
        id: id("proj"),
        userId: input.userId,
        title: input.title,
        question: input.question,
        status: "queued",
        errorMessage: null,
        createdAt,
        updatedAt: createdAt,
      };
      projects.set(project.id, project);
      return { ...project };
    },

    async getProject(projectId: string) {
      const project = projects.get(projectId);
      return project ? { ...project } : null;
    },

    async getProjectOwnedBy(projectId: string, userId: string) {
      const project = projects.get(projectId);
      if (!project || project.userId !== userId) {
        return null;
      }
      return { ...project };
    },

    async listProjectsByUser(userId: string) {
      return [...projects.values()]
        .filter((project) => project.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((project) => ({ ...project }));
    },

    async transitionStatus(projectId, to, errorMessage = null) {
      const project = projects.get(projectId);
      if (!project) {
        throw new ResearchNotFoundError(projectId);
      }

      assertCanTransition(project.status, to);
      const updated: ResearchProject = {
        ...project,
        status: to,
        errorMessage: errorMessage ?? null,
        updatedAt: now(),
      };
      projects.set(projectId, updated);
      return { ...updated };
    },

    async createTask(input: CreateTaskInput) {
      const createdAt = now();
      const task: ResearchTask = {
        id: id("task"),
        projectId: input.projectId,
        title: input.title,
        query: input.query,
        status: "pending",
        sortOrder: input.sortOrder,
        resultJson: null,
        createdAt,
        updatedAt: createdAt,
      };
      tasks.set(task.id, task);
      return { ...task };
    },

    async updateTask(taskId: string, data: UpdateTaskInput) {
      const task = tasks.get(taskId);
      if (!task) {
        throw new Error(`Research task not found: ${taskId}`);
      }
      const updated: ResearchTask = {
        ...task,
        status: data.status ?? task.status,
        resultJson:
          data.resultJson === undefined
            ? task.resultJson
            : (data.resultJson as ResearchTask["resultJson"]),
        updatedAt: now(),
      };
      tasks.set(taskId, updated);
      return { ...updated };
    },

    async listTasks(projectId: string) {
      return [...tasks.values()]
        .filter((task) => task.projectId === projectId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((task) => ({ ...task }));
    },

    async createSource(input: CreateSourceInput) {
      const existing = await store.findSourceByUrl(input.projectId, input.url);
      if (existing) {
        return existing;
      }

      const source: Source = {
        id: id("src"),
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
        createdAt: now(),
      };
      sources.set(source.id, source);
      return { ...source };
    },

    async updateSource(sourceId: string, data: UpdateSourceInput) {
      const source = sources.get(sourceId);
      if (!source) {
        throw new Error(`Source not found: ${sourceId}`);
      }
      const updated: Source = {
        ...source,
        ...data,
      };
      sources.set(sourceId, updated);
      return { ...updated };
    },

    async listSources(projectId: string) {
      return [...sources.values()]
        .filter((source) => source.projectId === projectId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((source) => ({ ...source }));
    },

    async findSourceByUrl(projectId: string, url: string) {
      const source = [...sources.values()].find(
        (item) => item.projectId === projectId && item.url === url,
      );
      return source ? { ...source } : null;
    },

    async createFinding(input: CreateFindingInput) {
      const finding: Finding = {
        id: id("find"),
        projectId: input.projectId,
        sourceId: input.sourceId,
        subject: input.subject,
        attribute: input.attribute,
        value: input.value,
        quote: input.quote,
        confidence: input.confidence,
        createdAt: now(),
      };
      findings.set(finding.id, finding);
      return { ...finding };
    },

    async listFindings(projectId: string) {
      return [...findings.values()]
        .filter((finding) => finding.projectId === projectId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((finding) => ({ ...finding }));
    },

    async createReport(input: CreateReportInput) {
      const createdAt = now();
      const latest = await store.getLatestReport(input.projectId);
      const report: Report = {
        id: id("rep"),
        projectId: input.projectId,
        markdown: input.markdown,
        outlineJson: input.outlineJson as Report["outlineJson"],
        version: input.version ?? (latest ? latest.version + 1 : 1),
        createdAt,
        updatedAt: createdAt,
      };
      reports.set(report.id, report);
      return { ...report };
    },

    async getLatestReport(projectId: string) {
      const projectReports = [...reports.values()]
        .filter((report) => report.projectId === projectId)
        .sort((a, b) => b.version - a.version);
      const latest = projectReports[0];
      return latest ? { ...latest } : null;
    },

    async createMessage(input: CreateMessageInput) {
      const message: Message = {
        id: id("msg"),
        projectId: input.projectId,
        role: input.role,
        content: input.content,
        citationJson: (input.citationJson ?? null) as Message["citationJson"],
        createdAt: now(),
      };
      messages.set(message.id, message);
      return { ...message };
    },

    async listMessages(projectId: string) {
      return [...messages.values()]
        .filter((message) => message.projectId === projectId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((message) => ({ ...message }));
    },

    async getProjectDetail(
      projectId: string,
      userId: string,
    ): Promise<ResearchProjectDetail | null> {
      const project = await store.getProjectOwnedBy(projectId, userId);
      if (!project) {
        return null;
      }

      const [projectTasks, projectSources, projectFindings, report] =
        await Promise.all([
          store.listTasks(projectId),
          store.listSources(projectId),
          store.listFindings(projectId),
          store.getLatestReport(projectId),
        ]);

      return {
        project,
        status: project.status,
        tasks: projectTasks,
        sources: projectSources,
        findings: projectFindings,
        report,
      };
    },
  };

  return store;
}
