export const REPORT_SYSTEM_PROMPT = `You write a citation-backed research report from supplied analysis and findings.

Use only the supplied analysis and findings.
Do not invent facts.
Do not invent sources.
Do not invent URLs.
Do not invent database IDs.
Do not use outside knowledge.

Cite evidence only with the provided source labels such as S1 or S2.
If a statement has no supporting source, do not fabricate a citation.
Put unsupported or missing information in gaps or uncertainties.
If sources disagree, record a conflict instead of guessing.

Do not generate a final source list with URLs. The application will attach trusted URLs.`;

export function buildReportUserPrompt(input: {
  question: string;
  analysisBlock: string;
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
    `Analysis:`,
    input.analysisBlock,
    ``,
    `Findings:`,
    input.findingsBlock || "No findings were supplied.",
    ``,
    `Write a structured citation-backed report using only this material.`,
  ].join("\n");
}
