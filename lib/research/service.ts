import { createGeminiProvider } from "@/lib/ai/gemini";
import { getEnv } from "@/lib/env";
import { createProductionToolRegistry } from "@/lib/tools/production-registry";
import { createResearchInputSchema } from "./input";
import { runResearchPipeline } from "./pipeline";
import { getResearchStore } from "./runtime";
import { titleFromQuestion } from "./title";
import type { ResearchProject, ResearchProjectDetail } from "./types";
import type { ResearchStore } from "./store";

export async function createQueuedProject(
  userId: string,
  question: string,
  store: ResearchStore = getResearchStore(),
): Promise<ResearchProject> {
  const parsed = createResearchInputSchema.parse({ question });
  const project = await store.createProject({
    userId,
    title: titleFromQuestion(parsed.question),
    question: parsed.question,
  });

  await store.createMessage({
    projectId: project.id,
    role: "user",
    content: parsed.question,
  });

  return project;
}

export async function listResearchProjects(
  userId: string,
  store: ResearchStore = getResearchStore(),
): Promise<ResearchProject[]> {
  return store.listProjectsByUser(userId);
}

export async function getResearchProjectForUser(
  projectId: string,
  userId: string,
  store: ResearchStore = getResearchStore(),
): Promise<ResearchProjectDetail | null> {
  return store.getProjectDetail(projectId, userId);
}

export async function runQueuedResearchPipeline(
  projectId: string,
  store: ResearchStore = getResearchStore(),
) {
  const env = getEnv();

  return runResearchPipeline(projectId, {
    store,
    tools: createProductionToolRegistry(),
    llm: createGeminiProvider({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
    }),
  });
}
