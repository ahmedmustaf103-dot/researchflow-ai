import { describe, expect, it } from "vitest";
import {
  hostnameFromUrl,
  selectDomainsFromSources,
} from "@/lib/research/domains";
import { MAX_MCP_ENRICH_DOMAINS } from "@/lib/research/limits";
import type { Source } from "@/lib/research/types";

function source(url: string, overrides: Partial<Source> = {}): Source {
  return {
    id: overrides.id ?? `src-${url}`,
    projectId: "project-1",
    taskId: null,
    url,
    title: overrides.title ?? url,
    snippet: null,
    content: null,
    contentHash: null,
    httpStatus: null,
    toolName: "search",
    fetchedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("domain selection", () => {
  it("extracts hostnames from HTTP(S) URLs", () => {
    expect(hostnameFromUrl("https://stripe.com/docs")).toBe("stripe.com");
    expect(hostnameFromUrl("http://adyen.com/pricing")).toBe("adyen.com");
  });

  it("normalizes www and ignores mcp / invalid URLs", () => {
    expect(hostnameFromUrl("https://www.paypal.com/home")).toBe("paypal.com");
    expect(hostnameFromUrl("mcp://company-profile/stripe.com")).toBeNull();
    expect(hostnameFromUrl("not-a-url")).toBeNull();
    expect(hostnameFromUrl("ftp://files.example.com/a")).toBeNull();
  });

  it("deduplicates, preserves deterministic order, and respects the cap", () => {
    const domains = selectDomainsFromSources(
      [
        source("https://www.stripe.com/a"),
        source("https://stripe.com/b"),
        source("https://adyen.com/c"),
        source("https://paypal.com/d"),
        source("https://squareup.com/e"),
        source("not-valid"),
        source("mcp://company-profile/stripe.com"),
      ],
      3,
    );

    expect(domains).toEqual(["stripe.com", "adyen.com", "paypal.com"]);
    expect(domains).toHaveLength(Math.min(3, MAX_MCP_ENRICH_DOMAINS));
  });
});
