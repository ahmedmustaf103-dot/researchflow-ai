import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { resetEnvCache } from "@/lib/env";
import {
  createQueuedProject,
  getResearchProjectForUser,
  runQueuedResearchPipeline,
} from "@/lib/research/service";
import { loadEnvLocal } from "./load-env-local";

loadEnvLocal();
resetEnvCache();

const enabled = process.env.LIVE_API_TESTS === "1";
const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
const hasBrave = Boolean(process.env.BRAVE_API_KEY?.trim());
const canRun = enabled && hasGemini && hasBrave;

const QUESTION =
  "Research the top competitors of Stripe. Compare their main products, target customers, pricing approach, and key strengths.";

type OutlineReport = {
  report?: {
    keyFindings?: Array<{ sourceIds?: string[] }>;
    comparisons?: Array<{ sourceIds?: string[] }>;
    strengthsWeaknesses?: Array<{ sourceIds?: string[] }>;
    conflicts?: Array<{ sourceIds?: string[] }>;
  };
};

function collectCitedSourceIds(outline: unknown): string[] {
  if (!outline || typeof outline !== "object") {
    return [];
  }

  const report = (outline as OutlineReport).report;
  if (!report) {
    return [];
  }

  return [
    ...(report.keyFindings ?? []).flatMap((item) => item.sourceIds ?? []),
    ...(report.comparisons ?? []).flatMap((item) => item.sourceIds ?? []),
    ...(report.strengthsWeaknesses ?? []).flatMap((item) => item.sourceIds ?? []),
    ...(report.conflicts ?? []).flatMap((item) => item.sourceIds ?? []),
  ];
}

function markdownHttpUrls(markdown: string): string[] {
  return [...markdown.matchAll(/\((https?:\/\/[^)\s]+)\)/g)].map(
    (match) => match[1]!,
  );
}

describe.skipIf(!canRun)("live Prisma research pipeline E2E", () => {
  let userId: string | undefined;

  beforeAll(async () => {
    loadEnvLocal();
    resetEnvCache();
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect().catch(() => undefined);
  });

  it(
    "runs the production pipeline against PostgreSQL and persists a citation-backed report",
    async () => {
      const email = `live-e2e-${Date.now()}@researchflow.test`;
      const user = await prisma.user.create({
        data: {
          email,
          name: "Live Prisma E2E",
        },
      });
      userId = user.id;

      const project = await createQueuedProject(user.id, QUESTION);
      expect(project.status).toBe("queued");

      const pipelineResult = await runQueuedResearchPipeline(project.id);

      if (
        pipelineResult.status === "failed" &&
        /rate limit/i.test(pipelineResult.errorMessage ?? "")
      ) {
        expect.fail(
          `External Gemini API rate limit exceeded (not an application bug): ${pipelineResult.errorMessage}`,
        );
      }

      expect(
        pipelineResult.status,
        pipelineResult.errorMessage
          ? `Pipeline failed: ${pipelineResult.errorMessage}`
          : "Pipeline did not complete",
      ).toBe("completed");

      const detail = await getResearchProjectForUser(project.id, user.id);
      expect(detail).not.toBeNull();
      if (!detail) {
        return;
      }

      const dbProject = await prisma.researchProject.findUnique({
        where: { id: project.id },
      });
      expect(dbProject).not.toBeNull();
      expect(dbProject?.id).toBe(project.id);
      expect(detail.status).toBe("completed");
      expect(detail.project.status).toBe("completed");

      expect(detail.sources.length).toBeGreaterThan(0);
      for (const source of detail.sources) {
        expect(() => new URL(source.url)).not.toThrow();
        expect(source.url.startsWith("http")).toBe(true);
        expect(source.projectId).toBe(project.id);
      }

      expect(detail.findings.length).toBeGreaterThan(0);
      const sourceIds = new Set(detail.sources.map((source) => source.id));
      const sourceUrls = new Set(detail.sources.map((source) => source.url));
      for (const finding of detail.findings) {
        expect(sourceIds.has(finding.sourceId)).toBe(true);
        expect(finding.projectId).toBe(project.id);
      }

      expect(detail.report).not.toBeNull();
      expect(detail.report?.markdown).toContain("## Sources");
      expect(detail.report?.projectId).toBe(project.id);

      const citedIds = collectCitedSourceIds(detail.report?.outlineJson);
      for (const sourceId of citedIds) {
        expect(sourceIds.has(sourceId)).toBe(true);
      }

      for (const url of markdownHttpUrls(detail.report?.markdown ?? "")) {
        expect(sourceUrls.has(url)).toBe(true);
      }
    },
    600_000,
  );
});
