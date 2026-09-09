import type { ResearchStatus } from "./types";

export class InvalidResearchTransitionError extends Error {
  readonly from: ResearchStatus;
  readonly to: ResearchStatus;

  constructor(from: ResearchStatus, to: ResearchStatus) {
    super(`Invalid research status transition: ${from} → ${to}`);
    this.name = "InvalidResearchTransitionError";
    this.from = from;
    this.to = to;
  }
}

export class ResearchNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Research project not found: ${projectId}`);
    this.name = "ResearchNotFoundError";
  }
}

export class ResearchStageError extends Error {
  readonly stage: string;

  constructor(stage: string, message: string) {
    super(message);
    this.name = "ResearchStageError";
    this.stage = stage;
  }
}
