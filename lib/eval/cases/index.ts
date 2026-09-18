import type { EvalCase } from "../types";
import { qualityEvalCases } from "./quality";
import { reliabilityEvalCases } from "./reliability";

export { qualityEvalCases } from "./quality";
export { reliabilityEvalCases } from "./reliability";
export * from "./fixtures";

export function allEvalCases(): EvalCase[] {
  return [...qualityEvalCases, ...reliabilityEvalCases];
}

export function qualityCases(): EvalCase[] {
  return [...qualityEvalCases];
}

export function reliabilityCases(): EvalCase[] {
  return [...reliabilityEvalCases];
}
