import { z } from "zod";

export const companyProfileInputSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1, "domain must not be empty")
    .max(253),
});

export const companyProfileSourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
});

export const companyProfileSchema = z.object({
  domain: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1),
  products: z.array(z.string()),
  targetCustomers: z.array(z.string()),
  pricingNotes: z.array(z.string()),
  strengths: z.array(z.string()),
  sources: z.array(companyProfileSourceSchema),
});

export type CompanyProfileInput = z.infer<typeof companyProfileInputSchema>;
export type CompanyProfile = z.infer<typeof companyProfileSchema>;

export const COMPANY_RESEARCH_SERVER_ID = "company-research";
export const LOOKUP_COMPANY_PROFILE_TOOL = "lookup_company_profile";
export const MCP_COMPANY_PROFILE_TOOL_NAME = `mcp:${LOOKUP_COMPANY_PROFILE_TOOL}`;

export function companyProfileSourceUrl(domain: string): string {
  return `mcp://company-profile/${domain}`;
}
