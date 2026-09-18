import companiesJson from "./companies.json";
import type { CompanyProfile } from "../schemas";

/**
 * Deterministic fixture company profiles for the portfolio/demo MCP server.
 * These are not live API results and must not be presented as real-time data.
 *
 * Source of truth: companies.json (also loaded by the stdio MCP server entry).
 */
export const COMPANY_PROFILE_FIXTURES = companiesJson as Record<
  string,
  CompanyProfile
>;

export function normalizeCompanyDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

export function getCompanyProfileFixture(
  domain: string,
): CompanyProfile | undefined {
  const normalized = normalizeCompanyDomain(domain);
  return COMPANY_PROFILE_FIXTURES[normalized];
}
