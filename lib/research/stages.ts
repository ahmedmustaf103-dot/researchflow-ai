import type { VerificationNote } from "./types";

export function verifyFindings(
  findings: Array<{ id: string; quote: string }>,
): VerificationNote[] {
  return findings.map((finding) => ({
    findingId: finding.id,
    supported: finding.quote.trim().length > 0,
    reason: finding.quote.trim()
      ? "Quote verification: finding is backed by a stored quote."
      : "Quote verification: finding has no supporting quote.",
  }));
}
