import { describe, expect, it } from "vitest";
import {
  isMcpSourceUrl,
  MCP_FIXTURE_NOTE,
  mcpCompanyDisplayName,
  sourceDomainLabel,
  sourceEvidenceKind,
  sourcePrimaryLabel,
  sourceToolLabel,
  sourceToolTechnicalName,
} from "@/lib/research/source-display";
import { MCP_COMPANY_PROFILE_TOOL_NAME } from "@/lib/tools/mcp/schemas";

describe("source-display", () => {
  it("labels MCP company-profile sources for recruiters", () => {
    const url = "mcp://company-profile/stripe.com";
    expect(isMcpSourceUrl(url)).toBe(true);
    expect(mcpCompanyDisplayName(url, "Stripe")).toBe("Stripe");
    expect(
      sourcePrimaryLabel({
        title: "Stripe",
        url,
        toolName: MCP_COMPANY_PROFILE_TOOL_NAME,
      }),
    ).toBe("Company profile — Stripe");
    expect(sourceToolLabel(MCP_COMPANY_PROFILE_TOOL_NAME)).toBe(
      "Company Profile · MCP",
    );
    expect(sourceToolTechnicalName(MCP_COMPANY_PROFILE_TOOL_NAME)).toBe(
      MCP_COMPANY_PROFILE_TOOL_NAME,
    );
  });

  it("leaves HTTP sources unchanged", () => {
    expect(
      sourcePrimaryLabel({
        title: "Payments overview",
        url: "https://example.com/payments",
        toolName: "search",
      }),
    ).toBe("Payments overview");
    expect(sourceToolLabel("search")).toBe("Web search");
    expect(sourceToolTechnicalName("search")).toBeNull();
    expect(
      sourceEvidenceKind({
        url: "https://www.emaar.com/en",
        toolName: "fetch_page",
      }),
    ).toBe("web");
    expect(sourceDomainLabel("https://www.emaar.com/en")).toBe("emaar.com");
  });

  it("marks MCP fixtures as local demo data, separate from web sources", () => {
    const url = "mcp://company-profile/emaar.com";
    expect(sourceEvidenceKind({ url, toolName: MCP_COMPANY_PROFILE_TOOL_NAME })).toBe(
      "mcp",
    );
    expect(sourceDomainLabel(url)).toBe("emaar.com");
    expect(MCP_FIXTURE_NOTE).toBe("Local demo fixture — not live company data");
    expect(sourceToolLabel(MCP_COMPANY_PROFILE_TOOL_NAME)).toBe(
      "Company Profile · MCP",
    );
  });
});
