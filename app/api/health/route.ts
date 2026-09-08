import { checkHealth } from "@/lib/db/health";
import { pingDatabase } from "@/lib/db/ping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkHealth(pingDatabase);

  return Response.json(
    {
      status: result.status,
      checks: result.checks,
    },
    { status: result.status === "ok" ? 200 : 503 },
  );
}
