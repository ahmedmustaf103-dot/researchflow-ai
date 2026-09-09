import { z } from "zod";

export const createResearchInputSchema = z.object({
  question: z.string().trim().min(10).max(4000),
});
