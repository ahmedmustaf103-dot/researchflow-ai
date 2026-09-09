import { InvalidResearchTransitionError } from "./errors";
import type { ResearchStatus } from "./types";
import { TERMINAL_RESEARCH_STATUSES } from "./types";

const ALLOWED_TRANSITIONS: Record<ResearchStatus, readonly ResearchStatus[]> = {
  queued: ["planning", "failed", "cancelled"],
  planning: ["researching", "failed", "cancelled"],
  researching: ["verifying", "failed", "cancelled"],
  verifying: ["analysing", "failed", "cancelled"],
  analysing: ["reporting", "failed", "cancelled"],
  reporting: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function isTerminalStatus(status: ResearchStatus): boolean {
  return (TERMINAL_RESEARCH_STATUSES as readonly ResearchStatus[]).includes(
    status,
  );
}

export function canTransition(
  from: ResearchStatus,
  to: ResearchStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertCanTransition(
  from: ResearchStatus,
  to: ResearchStatus,
): void {
  if (!canTransition(from, to)) {
    throw new InvalidResearchTransitionError(from, to);
  }
}

export function allowedTransitions(
  from: ResearchStatus,
): readonly ResearchStatus[] {
  return ALLOWED_TRANSITIONS[from];
}
