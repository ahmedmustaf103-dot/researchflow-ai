import { z } from "zod";
import type { LLMProvider } from "@/lib/ai/provider";
import {
  buildExtractUserPrompt,
  EXTRACT_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/extract";
import {
  MAX_CLAIM_LENGTH,
  MAX_FINDINGS_PER_SOURCE,
  MAX_PAGE_CHARACTERS,
  MAX_QUOTE_LENGTH,
  MAX_RELEVANCE_LENGTH,
} from "./limits";
import type { CreateFindingInput } from "./store";
import type { ResearchTask, Source } from "./types";

export const extractedFindingSchema = z.object({
  claim: z
    .string()
    .trim()
    .min(1, "claim must not be empty")
    .max(MAX_CLAIM_LENGTH),
  quote: z
    .string()
    .trim()
    .min(1, "quote must not be empty")
    .max(MAX_QUOTE_LENGTH),
  relevance: z
    .string()
    .trim()
    .min(1, "relevance must not be empty")
    .max(MAX_RELEVANCE_LENGTH),
});

export const extractedFindingsSchema = z.object({
  findings: z.array(extractedFindingSchema),
});

export type ExtractedEvidenceFinding = z.infer<typeof extractedFindingSchema>;
export type ExtractedEvidence = z.infer<typeof extractedFindingsSchema>;

export function normalizeForQuoteMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function quoteExistsInSource(quote: string, content: string): boolean {
  const normalizedQuote = normalizeForQuoteMatch(quote);
  if (!normalizedQuote) {
    return false;
  }

  return normalizeForQuoteMatch(content).includes(normalizedQuote);
}

export function clampExtractedFindings(
  findings: ExtractedEvidenceFinding[],
): ExtractedEvidenceFinding[] {
  return findings.slice(0, MAX_FINDINGS_PER_SOURCE);
}

export function isSourceEligibleForExtraction(source: Source): boolean {
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

export function sourceContentForExtraction(source: Source): string {
  return (source.content ?? "").slice(0, MAX_PAGE_CHARACTERS);
}

export function toCreateFindingInput(
  finding: ExtractedEvidenceFinding,
  source: Source,
): CreateFindingInput {
  return {
    projectId: source.projectId,
    sourceId: source.id,
    subject: "evidence",
    attribute: finding.relevance,
    value: finding.claim,
    quote: finding.quote,
    confidence: 1,
  };
}

function findingKey(finding: ExtractedEvidenceFinding): string {
  return `${normalizeForQuoteMatch(finding.claim).toLowerCase()}|${normalizeForQuoteMatch(finding.quote).toLowerCase()}`;
}

export function selectVerifiedFindings(
  findings: ExtractedEvidenceFinding[],
  content: string,
  sourceId: string,
): ExtractedEvidenceFinding[] {
  const accepted: ExtractedEvidenceFinding[] = [];
  const seen = new Set<string>();

  for (const finding of clampExtractedFindings(findings)) {
    if (!quoteExistsInSource(finding.quote, content)) {
      console.error(
        `[research extract] rejected unsupported quote source=${sourceId}`,
      );
      continue;
    }

    const key = findingKey(finding);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    accepted.push(finding);
  }

  return accepted;
}

export async function extractEvidenceFromSource(input: {
  question: string;
  source: Source;
  task?: ResearchTask | null;
  llm: LLMProvider;
}): Promise<CreateFindingInput[]> {
  if (!isSourceEligibleForExtraction(input.source)) {
    return [];
  }

  const content = sourceContentForExtraction(input.source);
  if (!content.trim()) {
    return [];
  }

  let parsed: ExtractedEvidence;
  try {
    const result = await input.llm.generateObject(
      {
        system: EXTRACT_SYSTEM_PROMPT,
        prompt: buildExtractUserPrompt({
          question: input.question,
          taskTitle: input.task?.title,
          taskQuery: input.task?.query,
          sourceTitle: input.source.title,
          sourceUrl: input.source.url,
          content,
        }),
      },
      extractedFindingsSchema,
    );

    const validated = extractedFindingsSchema.safeParse(result.object);
    if (!validated.success) {
      console.error(
        `[research extract] invalid structured output source=${input.source.id}`,
      );
      return [];
    }

    parsed = validated.data;
  } catch {
    console.error(
      `[research extract] Gemini extraction failed source=${input.source.id}`,
    );
    return [];
  }

  return selectVerifiedFindings(
    parsed.findings,
    content,
    input.source.id,
  ).map((finding) => toCreateFindingInput(finding, input.source));
}

export async function extractEvidenceFromSources(input: {
  question: string;
  sources: Source[];
  tasks: ResearchTask[];
  llm: LLMProvider;
}): Promise<CreateFindingInput[]> {
  const tasksById = new Map(input.tasks.map((task) => [task.id, task]));
  const persisted: CreateFindingInput[] = [];

  for (const source of input.sources) {
    const extracted = await extractEvidenceFromSource({
      question: input.question,
      source,
      task: source.taskId ? tasksById.get(source.taskId) : undefined,
      llm: input.llm,
    });
    persisted.push(...extracted);
  }

  return persisted;
}
