export const RESEARCH_TEMPLATE_IDS = [
  "competitor",
  "property",
  "area",
  "developer",
  "market",
] as const;

export type ResearchTemplateId = (typeof RESEARCH_TEMPLATE_IDS)[number];

export type ResearchTemplateField = {
  id: string;
  label: string;
  placeholder: string;
  required: true;
};

export type ResearchTemplate = {
  id: ResearchTemplateId;
  label: string;
  description: string;
  fields: readonly ResearchTemplateField[];
  example?: string;
};

export type TemplateFieldValues = Readonly<
  Record<string, string | null | undefined>
>;

export type ComposeResearchQuestionResult =
  | { ok: true; question: string }
  | { ok: false; missingFieldIds: string[] };

export const DEFAULT_RESEARCH_TEMPLATE_ID: ResearchTemplateId = "competitor";

export const RESEARCH_TEMPLATES: readonly ResearchTemplate[] = [
  {
    id: "competitor",
    label: "Competitor comparison",
    description:
      "Compare residential developments on developer, positioning, amenities, target market and differentiators.",
    example:
      "Example: What are the top residential developments competing with Dubai Marina? Compare developer, price positioning, amenities, target market and differentiators. Record missing prices or specifications as gaps.",
    fields: [
      {
        id: "development",
        label: "Development",
        placeholder: "Marina Gate",
        required: true,
      },
      {
        id: "location",
        label: "Location",
        placeholder: "Dubai Marina",
        required: true,
      },
    ],
  },
  {
    id: "property",
    label: "Property research",
    description:
      "Build a sourced briefing on a specific development and identify missing or conflicting information.",
    fields: [
      {
        id: "development",
        label: "Property or development",
        placeholder: "Marina Gate",
        required: true,
      },
      {
        id: "location",
        label: "Location",
        placeholder: "Dubai Marina",
        required: true,
      },
    ],
  },
  {
    id: "area",
    label: "Area research",
    description:
      "Build a first-pass evidence brief on a residential area and its competing developments.",
    fields: [
      {
        id: "location",
        label: "Location",
        placeholder: "Dubai Marina",
        required: true,
      },
      {
        id: "propertyType",
        label: "Property type",
        placeholder: "Residential",
        required: true,
      },
    ],
  },
  {
    id: "developer",
    label: "Developer research",
    description:
      "Research a developer, its developments and publicly described positioning.",
    fields: [
      {
        id: "developer",
        label: "Developer",
        placeholder: "Developer name",
        required: true,
      },
    ],
  },
  {
    id: "market",
    label: "Market snapshot",
    description:
      "Summarise publicly reported market conditions while separating evidence from missing data.",
    fields: [
      {
        id: "location",
        label: "Location",
        placeholder: "Dubai Marina",
        required: true,
      },
      {
        id: "propertyType",
        label: "Property type",
        placeholder: "Residential",
        required: true,
      },
    ],
  },
];

const QUESTION_BY_TEMPLATE: Record<
  ResearchTemplateId,
  (text: (fieldId: string) => string) => string
> = {
  competitor: (text) =>
    `Compare major residential developments competing with ${text("development")} in ${text("location")}, including developer, price positioning, amenities, target market and differentiators. Record missing prices or specifications as gaps.`,
  property: (text) =>
    `Research ${text("development")} in ${text("location")} and compare it with similar residential developments nearby, covering developer, positioning, amenities and target market. Record missing prices or specifications as gaps.`,
  area: (text) =>
    `Analyse ${text("location")} for ${text("propertyType")} demand, competing developments, amenities and publicly reported market conditions. Separate sourced observations from missing data.`,
  developer: (text) =>
    `Research ${text("developer")}, its major developments and publicly described company information, including positioning and target market. Record missing information as gaps.`,
  market: (text) =>
    `Analyse the current ${text("propertyType")} property market in ${text("location")} using publicly available sources. Separate sourced observations from missing data.`,
};

export function getResearchTemplate(
  id: ResearchTemplateId,
): ResearchTemplate {
  const template = RESEARCH_TEMPLATES.find((item) => item.id === id);
  if (!template) {
    throw new Error(`Unknown research template: ${id}`);
  }
  return template;
}

function fieldText(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ");
}

export function composeResearchQuestion(
  templateId: ResearchTemplateId,
  values: TemplateFieldValues,
): ComposeResearchQuestionResult {
  const template = getResearchTemplate(templateId);
  const missingFieldIds = template.fields
    .filter((field) => fieldText(values[field.id]).length === 0)
    .map((field) => field.id);

  if (missingFieldIds.length > 0) {
    return { ok: false, missingFieldIds };
  }

  const question = QUESTION_BY_TEMPLATE[templateId]((fieldId) =>
    fieldText(values[fieldId]),
  );

  return { ok: true, question };
}
