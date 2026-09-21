import { describe, expect, it } from "vitest";
import {
  isMcpSourceUrl,
  mcpCompanyDisplayName,
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
  });
});
