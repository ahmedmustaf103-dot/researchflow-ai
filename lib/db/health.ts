export type HealthStatus = "ok" | "degraded";

export type HealthCheckName = "app" | "database";

export type HealthChecks = {
  app: "ok";
  database: "ok" | "error";
};

export type HealthResult = {
  status: HealthStatus;
  checks: HealthChecks;
};

export function buildHealthResult(databaseOk: boolean): HealthResult {
  return {
    status: databaseOk ? "ok" : "degraded",
    checks: {
      app: "ok",
      database: databaseOk ? "ok" : "error",
    },
  };
}

export async function checkHealth(
  pingDatabase: () => Promise<boolean>,
): Promise<HealthResult> {
  let databaseOk = false;

  try {
    databaseOk = await pingDatabase();
  } catch {
    databaseOk = false;
  }

  return buildHealthResult(databaseOk);
}
