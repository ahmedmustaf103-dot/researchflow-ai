export const SOURCE_CONTENT_START = "<<<SOURCE_CONTENT>>>";
export const SOURCE_CONTENT_END = "<<<END_SOURCE_CONTENT>>>";

export const EXTRACT_SYSTEM_PROMPT = `You extract structured evidence from one retrieved source for a business and market research application.

Extract evidence ONLY from the supplied source content.
Do not invent facts.
Do not invent quotations.
Do not use outside knowledge.
Do not create URLs.
Do not create source IDs.
Do not claim anything that is not supported by the supplied content.

Each finding must include:
- claim: a concise statement supported by the source
- quote: an exact quotation copied from the supplied source content
- relevance: why this evidence matters to the research question

If the source does not contain useful evidence for the research question, return an empty findings array.
Do not force findings.
Return at most 8 findings.
Prefer the strongest, non-duplicate evidence.`;

export function buildExtractUserPrompt(input: {
  question: string;
  taskTitle?: string | null;
  taskQuery?: string | null;
  sourceTitle: string;
  sourceUrl: string;
  content: string;
}): string {
  const taskLines = [
    input.taskTitle ? `Research task: ${input.taskTitle}` : null,
    input.taskQuery ? `Task query: ${input.taskQuery}` : null,
  ].filter((line): line is string => Boolean(line));

  return [
    `Research question:`,
    input.question,
    ``,
    ...taskLines,
    ...(taskLines.length > 0 ? [""] : []),
    `Source title: ${input.sourceTitle}`,
    `Source URL: ${input.sourceUrl}`,
    ``,
    `Source content:`,
    SOURCE_CONTENT_START,
    input.content,
    SOURCE_CONTENT_END,
    ``,
    `Extract structured evidence from this source only.`,
  ].join("\n");
}
