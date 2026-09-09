import { getSessionUserId } from "@/lib/auth/session";
import { getResearchProjectForUser } from "@/lib/research/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const detail = await getResearchProjectForUser(id, userId);

  if (!detail) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({
    project: detail.project,
    status: detail.status,
    tasks: detail.tasks,
    sources: detail.sources,
    findings: detail.findings,
    report: detail.report,
  });
}
