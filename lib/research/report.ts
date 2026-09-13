import { z } from "zod";
import type { LLMProvider } from "@/lib/ai/provider";
import {
  REPORT_SYSTEM_PROMPT,
  buildReportUserPrompt,
} from "@/lib/ai/prompts/report";
import type { ResearchAnalysis } from "./analyse";
import {
  buildSourceCatalog,
  findingsForPrompt,
  formatSourceCatalog,
  sanitizeSourceIds,
} from "./citations";
import { ResearchStageError } from "./errors";
import {
  MAX_REPORT_LIST_ITEMS,
  MAX_REPORT_TEXT_LENGTH,
} from "./limits";
import type { Finding, GeneratedReport, Source } from "./types";

const sourceIdList = z.array(z.string().trim().min(1)).max(MAX_REPORT_LIST_ITEMS);
const textList = z
  .array(z.string().trim().min(1).max(MAX_REPORT_TEXT_LENGTH))
  .max(MAX_REPORT_LIST_ITEMS);

export const researchReportSchema = z.object({
  title: z.string().trim().min(1).max(200),
  executiveSummary: z.string().trim().min(1).max(MAX_REPORT_TEXT_LENGTH),
  scope: z.string().trim().min(1).max(MAX_REPORT_TEXT_LENGTH),
  keyFindings: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(MAX_REPORT_TEXT_LENGTH),
        sourceIds: sourceIdList,
      }),
    )
    .max(MAX_REPORT_LIST_ITEMS),
  comparisons: z
    .array(
      z.object({
        dimension: z.string().trim().min(1).max(200),
        points: textList,
        sourceIds: sourceIdList,
      }),
    )
    .max(MAX_REPORT_LIST_ITEMS),
  strengthsWeaknesses: z
    .array(
      z.object({
        subject: z.string().trim().min(1).max(200),
        strengths: textList,
        weaknesses: textList,
        sourceIds: sourceIdList,
      }),
    )
    .max(MAX_REPORT_LIST_ITEMS),
  gaps: textList,
  uncertainties: textList,
  conflicts: z
    .array(
      z.object({
        topic: z.string().trim().min(1).max(200),
        statements: textList,
        sourceIds: sourceIdList,
      }),
    )
    .max(MAX_REPORT_LIST_ITEMS),
});

export type ResearchReport = z.infer<typeof researchReportSchema>;

export function sanitizeReportCitations(
  report: ResearchReport,
  sources: Source[],
): ResearchReport {
  return {
    ...report,
    keyFindings: report.keyFindings.map((item) => ({
      ...item,
      sourceIds: sanitizeSourceIds(item.sourceIds, sources),
    })),
    comparisons: report.comparisons.map((item) => ({
      ...item,
      sourceIds: sanitizeSourceIds(item.sourceIds, sources),
    })),
    strengthsWeaknesses: report.strengthsWeaknesses.map((item) => ({
      ...item,
      sourceIds: sanitizeSourceIds(item.sourceIds, sources),
    })),
    conflicts: report.conflicts.map((item) => ({
      ...item,
      sourceIds: sanitizeSourceIds(item.sourceIds, sources),
    })),
  };
}

export function citedSourceIds(report: ResearchReport): string[] {
  return [
    ...new Set([
      ...report.keyFindings.flatMap((item) => item.sourceIds),
      ...report.comparisons.flatMap((item) => item.sourceIds),
      ...report.strengthsWeaknesses.flatMap((item) => item.sourceIds),
      ...report.conflicts.flatMap((item) => item.sourceIds),
    ]),
  ];
}

function citationMarkers(
  sourceIds: string[],
  numberById: Map<string, number>,
): string {
  const markers = sourceIds
    .map((id) => numberById.get(id))
    .filter((value): value is number => value !== undefined)
    .map((value) => `[${value}]`);

  return markers.length > 0 ? ` ${markers.join("")}` : "";
}

export function renderCitationBackedReport(input: {
  question: string;
  report: ResearchReport;
  sources: Source[];
}): GeneratedReport {
  const sourcesById = new Map(input.sources.map((source) => [source.id, source]));
  const cited = citedSourceIds(input.report)
    .map((id) => sourcesById.get(id))
    .filter((source): source is Source => Boolean(source));
  const numberById = new Map(
    cited.map((source, index) => [source.id, index + 1]),
  );

  const keyFindingLines = input.report.keyFindings.map(
    (item) =>
      `- ${item.text}${citationMarkers(item.sourceIds, numberById)}`,
  );
  const comparisonLines = input.report.comparisons.flatMap((item) => [
    `### ${item.dimension}`,
    ...item.points.map(
      (point) => `- ${point}${citationMarkers(item.sourceIds, numberById)}`,
    ),
  ]);
  const swLines = input.report.strengthsWeaknesses.flatMap((item) => [
    `### ${item.subject}`,
    ...item.strengths.map(
      (point) =>
        `- Strength: ${point}${citationMarkers(item.sourceIds, numberById)}`,
    ),
    ...item.weaknesses.map(
      (point) =>
        `- Weakness: ${point}${citationMarkers(item.sourceIds, numberById)}`,
    ),
  ]);
  const conflictLines = input.report.conflicts.flatMap((item) => [
    `### ${item.topic}`,
    ...item.statements.map(
      (statement) =>
        `- ${statement}${citationMarkers(item.sourceIds, numberById)}`,
    ),
  ]);
  const sourceLines = cited.map((source, index) => {
    const url = source.url;
    return `${index + 1}. [${source.title}](${url})`;
  });

  const markdown = [
    `# ${input.report.title}`,
    ``,
    `**Question:** ${input.question}`,
    ``,
    `## Executive summary`,
    input.report.executiveSummary,
    ``,
    `## Scope`,
    input.report.scope,
    ``,
    `## Key findings`,
    keyFindingLines.join("\n") || "_No key findings._",
    ``,
    `## Comparisons`,
    comparisonLines.join("\n") || "_No comparisons._",
    ``,
    `## Strengths and weaknesses`,
    swLines.join("\n") || "_No strengths or weaknesses._",
    ``,
    `## Gaps`,
    input.report.gaps.map((item) => `- ${item}`).join("\n") || "_No gaps._",
    ``,
    `## Uncertainties`,
    input.report.uncertainties.map((item) => `- ${item}`).join("\n") ||
      "_No uncertainties._",
    ``,
    `## Conflicts`,
    conflictLines.join("\n") || "_No conflicts._",
    ``,
    `## Sources`,
    sourceLines.join("\n") || "_No cited sources._",
  ].join("\n");

  return {
    markdown,
    outline: {
      sections: [
        "Executive summary",
        "Scope",
        "Key findings",
        "Comparisons",
        "Strengths and weaknesses",
        "Gaps",
        "Uncertainties",
        "Conflicts",
        "Sources",
      ],
      report: input.report,
    },
  };
}

export async function generateCitationBackedReport(input: {
  question: string;
  analysis: ResearchAnalysis;
  findings: Finding[];
  sources: Source[];
  llm: LLMProvider;
}): Promise<GeneratedReport> {
  const catalog = buildSourceCatalog(input.sources);

  try {
    const result = await input.llm.generateObject(
      {
        system: REPORT_SYSTEM_PROMPT,
        prompt: buildReportUserPrompt({
          question: input.question,
          analysisBlock: JSON.stringify(input.analysis),
          findingsBlock: findingsForPrompt(input.findings, catalog),
          sourceCatalog: formatSourceCatalog(catalog),
        }),
      },
      researchReportSchema,
    );

    const parsed = researchReportSchema.safeParse(result.object);
    if (!parsed.success) {
      throw new ResearchStageError(
        "report",
        "Gemini returned invalid report output",
      );
    }

    const sanitized = sanitizeReportCitations(parsed.data, input.sources);
    return renderCitationBackedReport({
      question: input.question,
      report: sanitized,
      sources: input.sources,
    });
  } catch (error) {
    if (error instanceof ResearchStageError) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Gemini report generation failed";
    throw new ResearchStageError("report", message);
  }
}
