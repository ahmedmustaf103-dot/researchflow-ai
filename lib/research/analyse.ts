import { z } from "zod";
import type { LLMProvider } from "@/lib/ai/provider";
import {
  ANALYSE_SYSTEM_PROMPT,
  buildAnalyseUserPrompt,
} from "@/lib/ai/prompts/analyse";
import { MAX_ANALYSIS_TEXT_LENGTH } from "./limits";
import {
  buildSourceCatalog,
  findingsForPrompt,
  formatSourceCatalog,
} from "./citations";
import { ResearchStageError } from "./errors";
import type { Finding, Source } from "./types";

const textList = z.array(z.string().trim().min(1).max(MAX_ANALYSIS_TEXT_LENGTH));

export const researchAnalysisSchema = z.object({
  summary: z.string().trim().min(1).max(MAX_ANALYSIS_TEXT_LENGTH),
  comparisons: z.array(
    z.object({
      dimension: z.string().trim().min(1).max(200),
      points: textList,
    }),
  ),
  similarities: textList,
  differences: textList,
  gaps: textList,
  uncertainties: textList,
  conflicts: z.array(
    z.object({
      topic: z.string().trim().min(1).max(200),
      statements: textList,
    }),
  ),
});

export type ResearchAnalysis = z.infer<typeof researchAnalysisSchema>;

export async function analyseResearch(input: {
  question: string;
  findings: Finding[];
  sources: Source[];
  llm: LLMProvider;
}): Promise<ResearchAnalysis> {
  const catalog = buildSourceCatalog(input.sources);

  try {
    const result = await input.llm.generateObject(
      {
        system: ANALYSE_SYSTEM_PROMPT,
        prompt: buildAnalyseUserPrompt({
          question: input.question,
          findingsBlock: findingsForPrompt(input.findings, catalog),
          sourceCatalog: formatSourceCatalog(catalog),
        }),
      },
      researchAnalysisSchema,
    );

    const parsed = researchAnalysisSchema.safeParse(result.object);
    if (!parsed.success) {
      throw new ResearchStageError(
        "analyse",
        "Gemini returned invalid analysis output",
      );
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof ResearchStageError) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Gemini analysis failed";
    throw new ResearchStageError("analyse", message);
  }
}
