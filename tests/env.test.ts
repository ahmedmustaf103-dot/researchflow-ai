import { describe, expect, it } from "vitest";

describe("test environment", () => {
  it("runs in the test NODE_ENV", () => {
    expect(process.env.NODE_ENV).toBe("test");
  });
});
