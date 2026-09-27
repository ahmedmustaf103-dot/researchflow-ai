import { listResearchProjects } from "@/lib/research/service";
import { QuestionForm } from "@/components/research/question-form";
import { auth } from "@/lib/auth";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  const projects = session?.user?.id
    ? await listResearchProjects(session.user.id)
    : [];

  return (
    <main className="mx-auto w-full max-w-3xl space-y-10 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Evidence-backed property research</h1>
        <p className="mt-2 text-zinc-800 dark:text-zinc-100">
          Turn a property research question into a sourced, evidence-backed
          brief.
        </p>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          For estate agents, property analysts, developers, and research teams.
          Compare developments, research developers, and review areas from
          public evidence, with gaps and conflicts kept visible.
        </p>
      </div>

      <QuestionForm />

      <section>
        <h2 className="mb-3 text-lg font-medium">Briefs</h2>
        {projects.length === 0 ? (
          <div className="space-y-1 text-sm text-zinc-500">
            <p>No research briefs yet.</p>
            <p>
              Choose a workflow above to create your first evidence-backed
              brief.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/research/${project.id}`}
                  className="block rounded border border-zinc-200 p-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <div className="font-medium">{project.title}</div>
                  <div className="text-sm text-zinc-500">{project.status}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
