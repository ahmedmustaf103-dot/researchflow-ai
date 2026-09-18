import {
  companyProfileInputSchema,
  companyProfileSchema,
  type CompanyProfile,
  type CompanyProfileInput,
} from "./schemas";
import {
  getCompanyProfileFixture,
  normalizeCompanyDomain,
} from "./fixtures/companies";

export type CompanyProfileLookupResult =
  | { ok: true; profile: CompanyProfile }
  | { ok: false; error: string; code: "invalid_input" | "not_found" };

/**
 * Deterministic fixture-backed company lookup used by the MCP server.
 * Does not call external company-data APIs.
 */
export function lookupCompanyProfile(
  input: unknown,
): CompanyProfileLookupResult {
  const parsed = companyProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid company profile input",
      code: "invalid_input",
    };
  }

  const domain = normalizeCompanyDomain(parsed.data.domain);
  const fixture = getCompanyProfileFixture(domain);
  if (!fixture) {
    return {
      ok: false,
      error: `Unknown company domain: ${domain}`,
      code: "not_found",
    };
  }

  const profile = companyProfileSchema.parse({
    ...fixture,
    domain,
  });

  return { ok: true, profile };
}

export function formatCompanyProfileContent(profile: CompanyProfile): string {
  const lines = [
    `# ${profile.name}`,
    "",
    `Domain: ${profile.domain}`,
    "",
    "## Summary",
    profile.summary,
    "",
    "## Products",
    ...profile.products.map((item) => `- ${item}`),
    "",
    "## Target customers",
    ...profile.targetCustomers.map((item) => `- ${item}`),
    "",
    "## Pricing notes",
    ...profile.pricingNotes.map((item) => `- ${item}`),
    "",
    "## Strengths",
    ...profile.strengths.map((item) => `- ${item}`),
    "",
    "## Reference sources",
    ...profile.sources.map((item) => `- ${item.title}: ${item.url}`),
    "",
    "Note: This profile comes from a deterministic local fixture provider for portfolio/demo use. It is not a live company-data API response.",
  ];

  return lines.join("\n");
}

export function parseCompanyProfileInput(input: unknown): CompanyProfileInput {
  return companyProfileInputSchema.parse(input);
}
