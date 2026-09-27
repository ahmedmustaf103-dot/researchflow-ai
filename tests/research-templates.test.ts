import { describe, expect, it } from "vitest";
import { createResearchInputSchema } from "@/lib/research/input";
import {
  composeResearchQuestion,
  DEFAULT_RESEARCH_TEMPLATE_ID,
  getResearchTemplate,
  RESEARCH_TEMPLATE_IDS,
  RESEARCH_TEMPLATES,
  type ResearchTemplateId,
} from "@/lib/research/templates";

const UNSUPPORTED_CLAIM =
  /\b(undefined|null)\b|\[(development|location|property type|developer)\]|investment advice|valuation|yield|financing|expected return|investment horizon|recommend buying|proprietary market data/i;

const SAMPLES: Record<ResearchTemplateId, Record<string, string>> = {
  competitor: {
    development: "Marina Gate",
    location: "Dubai Marina",
  },
  property: {
    development: "Marina Gate",
    location: "Dubai Marina",
  },
  area: {
    location: "Dubai Marina",
    propertyType: "residential",
  },
  developer: {
    developer: "Emaar",
  },
  market: {
    location: "Dubai Marina",
    propertyType: "residential",
  },
};

describe("research templates", () => {
  it("defaults to the competitor template", () => {
    expect(DEFAULT_RESEARCH_TEMPLATE_ID).toBe("competitor");
    expect(RESEARCH_TEMPLATES.map((template) => template.id)).toEqual([
      ...RESEARCH_TEMPLATE_IDS,
    ]);
    expect(RESEARCH_TEMPLATES[0]?.id).toBe("competitor");
  });

  it("composes a competitor question", () => {
    expect(composeResearchQuestion("competitor", SAMPLES.competitor)).toEqual({
      ok: true,
      question:
        "Compare major residential developments competing with Marina Gate in Dubai Marina, including developer, price positioning, amenities, target market and differentiators. Record missing prices or specifications as gaps.",
    });
  });

  it("composes a property question", () => {
    expect(composeResearchQuestion("property", SAMPLES.property)).toEqual({
      ok: true,
      question:
        "Research Marina Gate in Dubai Marina and compare it with similar residential developments nearby, covering developer, positioning, amenities and target market. Record missing prices or specifications as gaps.",
    });
  });

  it("composes an area question", () => {
    expect(composeResearchQuestion("area", SAMPLES.area)).toEqual({
      ok: true,
      question:
        "Analyse Dubai Marina for residential demand, competing developments, amenities and publicly reported market conditions. Separate sourced observations from missing data.",
    });
  });

  it("composes a developer question", () => {
    expect(composeResearchQuestion("developer", SAMPLES.developer)).toEqual({
      ok: true,
      question:
        "Research Emaar, its major developments and publicly described company information, including positioning and target market. Record missing information as gaps.",
    });
  });

  it("composes a market question", () => {
    expect(composeResearchQuestion("market", SAMPLES.market)).toEqual({
      ok: true,
      question:
        "Analyse the current residential property market in Dubai Marina using publicly available sources. Separate sourced observations from missing data.",
    });
  });

  it("lists the required fields for each template", () => {
    expect(
      getResearchTemplate("competitor").fields.map((field) => field.id),
    ).toEqual(["development", "location"]);
    expect(
      getResearchTemplate("property").fields.map((field) => field.id),
    ).toEqual(["development", "location"]);
    expect(getResearchTemplate("area").fields.map((field) => field.id)).toEqual([
      "location",
      "propertyType",
    ]);
    expect(
      getResearchTemplate("developer").fields.map((field) => field.id),
    ).toEqual(["developer"]);
    expect(
      getResearchTemplate("market").fields.map((field) => field.id),
    ).toEqual(["location", "propertyType"]);

    for (const template of RESEARCH_TEMPLATES) {
      expect(template.fields.length).toBeGreaterThan(0);
      expect(template.fields.every((field) => field.required)).toBe(true);
    }
  });

  it("reports missing fields instead of drafting an incomplete question", () => {
    expect(
      composeResearchQuestion("competitor", { development: "Marina Gate" }),
    ).toEqual({
      ok: false,
      missingFieldIds: ["location"],
    });
    expect(
      composeResearchQuestion("market", {
        location: "   ",
        propertyType: "residential",
      }),
    ).toEqual({
      ok: false,
      missingFieldIds: ["location"],
    });
    expect(composeResearchQuestion("developer", {})).toEqual({
      ok: false,
      missingFieldIds: ["developer"],
    });
  });

  it("does not interpolate undefined, null, blanks, or unused values", () => {
    const incomplete = composeResearchQuestion("property", {
      development: undefined,
      location: null,
      budget: "hidden",
    });
    expect(incomplete.ok).toBe(false);
    expect(JSON.stringify(incomplete)).not.toMatch(UNSUPPORTED_CLAIM);
    expect(JSON.stringify(incomplete)).not.toContain("hidden");

    const composed = composeResearchQuestion("area", {
      location: "  Dubai   Marina ",
      propertyType: " residential ",
      yield: undefined,
      valuation: null,
    });
    expect(composed).toEqual({
      ok: true,
      question:
        "Analyse Dubai Marina for residential demand, competing developments, amenities and publicly reported market conditions. Separate sourced observations from missing data.",
    });
  });

  it("keeps generated questions inside the existing input schema", () => {
    for (const templateId of RESEARCH_TEMPLATE_IDS) {
      const result = composeResearchQuestion(templateId, SAMPLES[templateId]);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }
      expect(
        createResearchInputSchema.safeParse({ question: result.question }).success,
      ).toBe(true);
      expect(result.question.length).toBeGreaterThanOrEqual(10);
      expect(result.question.length).toBeLessThanOrEqual(4000);
    }
  });

  it("does not introduce investment, valuation, or proprietary-data claims", () => {
    for (const templateId of RESEARCH_TEMPLATE_IDS) {
      const result = composeResearchQuestion(templateId, SAMPLES[templateId]);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }
      expect(result.question).not.toMatch(UNSUPPORTED_CLAIM);
    }
  });
});
