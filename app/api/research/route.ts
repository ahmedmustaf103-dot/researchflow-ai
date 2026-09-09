import { after } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { createResearchInputSchema } from "@/lib/research/input";
import {
  createQueuedProject,
  runQueuedResearchPipeline,
} from "@/lib/research/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createResearchInputSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid question", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const project = await createQueuedProject(userId, parsed.data.question);

  after(() => {
    void runQueuedResearchPipeline(project.id).catch((error: unknown) => {
      console.error("[research pipeline]", error);
    });
  });

  return Response.json(
    {
      id: project.id,
      status: project.status,
    },
    { status: 201 },
  );
}
