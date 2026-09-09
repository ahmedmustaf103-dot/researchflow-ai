import { describe, expect, it } from "vitest";
import { InvalidResearchTransitionError } from "@/lib/research/errors";
import {
  assertCanTransition,
  canTransition,
  isTerminalStatus,
} from "@/lib/research/status";
import type { ResearchStatus } from "@/lib/research/types";

const happyPath: Array<[ResearchStatus, ResearchStatus]> = [
  ["queued", "planning"],
  ["planning", "researching"],
  ["researching", "verifying"],
  ["verifying", "analysing"],
  ["analysing", "reporting"],
  ["reporting", "completed"],
];

describe("research status machine", () => {
  it("allows the happy-path transitions", () => {
    for (const [from, to] of happyPath) {
      expect(canTransition(from, to)).toBe(true);
      expect(() => assertCanTransition(from, to)).not.toThrow();
    }
  });

  it("allows failure and cancellation from in-progress states", () => {
    const inProgress: ResearchStatus[] = [
      "queued",
      "planning",
      "researching",
      "verifying",
      "analysing",
      "reporting",
    ];

    for (const from of inProgress) {
      expect(canTransition(from, "failed")).toBe(true);
      expect(canTransition(from, "cancelled")).toBe(true);
    }
  });

  it("rejects skipped and reverse transitions", () => {
    expect(canTransition("queued", "completed")).toBe(false);
    expect(canTransition("planning", "verifying")).toBe(false);
    expect(canTransition("completed", "planning")).toBe(false);
    expect(() => assertCanTransition("queued", "reporting")).toThrow(
      InvalidResearchTransitionError,
    );
  });

  it("treats completed, failed, and cancelled as terminal", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("researching")).toBe(false);
    expect(canTransition("failed", "queued")).toBe(false);
    expect(canTransition("cancelled", "planning")).toBe(false);
  });
});
