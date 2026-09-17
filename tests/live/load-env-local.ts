import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load `.env.local` into `process.env`.
 * Overwrites keys that are present in the file so live tests use the real DB URL
 * even if `tests/setup.ts` already set a fallback.
 * Never logs values.
 */
export function loadEnvLocal(cwd = process.cwd()): void {
  const filePath = resolve(cwd, ".env.local");
  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }

    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[name] = value;
  }
}
