import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getResearchProjectForUser } from "@/lib/research/service";
import { ResearchProjectView } from "@/components/research/project-view";

export default async function ResearchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    notFound();
  }

  const { id } = await params;
  const detail = await getResearchProjectForUser(id, userId);
  if (!detail) {
    notFound();
  }

  return <ResearchProjectView projectId={id} initial={detail} />;
}
