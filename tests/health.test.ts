import { describe, expect, it, vi } from "vitest";
import { buildHealthResult, checkHealth } from "@/lib/db/health";

describe("health check", () => {
  it("reports ok when the database ping succeeds", () => {
    const result = buildHealthResult(true);

    expect(result).toEqual({
      status: "ok",
      checks: {
        app: "ok",
        database: "ok",
      },
    });
  });

  it("reports degraded when the database ping fails", () => {
    const result = buildHealthResult(false);

    expect(result.status).toBe("degraded");
    expect(result.checks.app).toBe("ok");
    expect(result.checks.database).toBe("error");
  });

  it("treats a thrown ping as a database error", async () => {
    const pingDatabase = vi.fn(async () => {
      throw new Error("connection refused");
    });

    const result = await checkHealth(pingDatabase);

    expect(result.status).toBe("degraded");
    expect(result.checks.database).toBe("error");
  });

  it("uses the injected ping function", async () => {
    const pingDatabase = vi.fn(async () => true);
    const result = await checkHealth(pingDatabase);

    expect(pingDatabase).toHaveBeenCalledOnce();
    expect(result.status).toBe("ok");
  });
});
