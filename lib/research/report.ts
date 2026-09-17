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

const text = z.string().trim().min(1);
const sourceIdList = z.array(z.string().trim().min(1));
const textList = z.array(text);

export const researchReportSchema = z.object({
  title: text,
  executiveSummary: text,
  scope: text,
  keyFindings: z.array(
    z.object({
      text,
      sourceIds: sourceIdList,
    }),
  ),
  comparisons: z.array(
    z.object({
      dimension: text,
      points: textList,
      sourceIds: sourceIdList,
    }),
  ),
  strengthsWeaknesses: z.array(
    z.object({
      subject: text,
      strengths: textList,
      weaknesses: textList,
      sourceIds: sourceIdList,
    }),
  ),
  gaps: textList,
  uncertainties: textList,
  conflicts: z.array(
    z.object({
      topic: text,
      statements: textList,
      sourceIds: sourceIdList,
    }),
  ),
});

export type ResearchReport = z.infer<typeof researchReportSchema>;

function clampText(value: string, max = MAX_REPORT_TEXT_LENGTH): string {
  return value.slice(0, max);
}

function clampTextList(values: string[]): string[] {
  return values.slice(0, MAX_REPORT_LIST_ITEMS).map((item) => clampText(item));
}

function clampSourceIds(values: string[]): string[] {
  return values.slice(0, MAX_REPORT_LIST_ITEMS);
}

export function clampResearchReport(report: ResearchReport): ResearchReport {
  return {
    title: clampText(report.title, 200),
    executiveSummary: clampText(report.executiveSummary),
    scope: clampText(report.scope),
    keyFindings: report.keyFindings.slice(0, MAX_REPORT_LIST_ITEMS).map((item) => ({
      text: clampText(item.text),
      sourceIds: clampSourceIds(item.sourceIds),
    })),
    comparisons: report.comparisons
      .slice(0, MAX_REPORT_LIST_ITEMS)
      .map((item) => ({
        dimension: clampText(item.dimension, 200),
        points: clampTextList(item.points),
        sourceIds: clampSourceIds(item.sourceIds),
      })),
    strengthsWeaknesses: report.strengthsWeaknesses
      .slice(0, MAX_REPORT_LIST_ITEMS)
      .map((item) => ({
        subject: clampText(item.subject, 200),
        strengths: clampTextList(item.strengths),
        weaknesses: clampTextList(item.weaknesses),
        sourceIds: clampSourceIds(item.sourceIds),
      })),
    gaps: clampTextList(report.gaps),
    uncertainties: clampTextList(report.uncertainties),
    conflicts: report.conflicts.slice(0, MAX_REPORT_LIST_ITEMS).map((item) => ({
      topic: clampText(item.topic, 200),
      statements: clampTextList(item.statements),
      sourceIds: clampSourceIds(item.sourceIds),
    })),
  };
}

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

    const sanitized = sanitizeReportCitations(
      clampResearchReport(parsed.data),
      input.sources,
    );
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
