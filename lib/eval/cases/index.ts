import type { EvalCase } from "../types";
import { qualityEvalCases } from "./quality";
import { realEstateEvalCases } from "./real-estate";
import { reliabilityEvalCases } from "./reliability";

export { qualityEvalCases } from "./quality";
export { realEstateEvalCases } from "./real-estate";
export { reliabilityEvalCases } from "./reliability";
export * from "./fixtures";

export function allEvalCases(): EvalCase[] {
  return [...qualityEvalCases, ...realEstateEvalCases, ...reliabilityEvalCases];
}

export function qualityCases(): EvalCase[] {
  return [...qualityEvalCases, ...realEstateEvalCases];
}

export function reliabilityCases(): EvalCase[] {
  return [...reliabilityEvalCases];
}
