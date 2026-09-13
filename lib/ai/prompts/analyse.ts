export const ANALYSE_SYSTEM_PROMPT = `You analyse persisted research evidence for a business and market research application.

Use only the supplied findings.
Do not invent facts.
Do not invent sources.
Do not invent URLs.
Do not invent database IDs.
Do not introduce unsupported claims.
Do not use outside knowledge.

If information is missing, put it in gaps.
If evidence is uncertain, put it in uncertainties.
If sources disagree, represent that as a conflict.
Do not silently resolve contradictory evidence by guessing.

Synthesize the evidence. Do not simply copy every finding.
Cite sources only with the provided labels such as S1 or S2.`;

export function buildAnalyseUserPrompt(input: {
  question: string;
  findingsBlock: string;
  sourceCatalog: string;
}): string {
  return [
    `Research question:`,
    input.question,
    ``,
    `Allowed source labels:`,
    input.sourceCatalog || "None",
    ``,
    `Findings:`,
    input.findingsBlock || "No findings were supplied.",
    ``,
    `Analyse only this evidence.`,
  ].join("\n");
}
