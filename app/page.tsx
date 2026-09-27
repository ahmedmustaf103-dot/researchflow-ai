import { auth, isGoogleOAuthConfigured } from "@/lib/auth";
import { SignInButton } from "@/components/auth/sign-in-button";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  const googleEnabled = isGoogleOAuthConfigured();

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <main className="w-full max-w-xl space-y-8 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">ResearchFlow AI</h1>
        <p className="text-xl font-medium tracking-tight text-zinc-800 dark:text-zinc-100">
          Evidence-backed AI research, built as a deterministic pipeline.
        </p>
        <dl className="space-y-4 text-left text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">Who</dt>
            <dd>
              Estate agents, property analysts, developers, and research teams.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">What</dt>
            <dd>
              Turn a property research question into a sourced, evidence-backed
              brief.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">How</dt>
            <dd>
              Gemini plans and writes the brief. Brave and Jina gather public
              pages. MCP adds local demo company profiles. Quotes and citations
              are checked, then shown in a Research Trace.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">Why</dt>
            <dd>
              Reduce the time needed to turn a research question into a
              defensible brief.
            </dd>
          </div>
        </dl>
        <p className="text-sm leading-6 text-zinc-500">
          Demo question, not a completed live run: What are the top residential
          developments competing with Dubai Marina? Compare developer, price
          positioning, amenities, target market and differentiators. Record
          missing prices or specifications as gaps.
        </p>
        {googleEnabled ? (
          <div className="flex justify-center">
            <SignInButton />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            Google sign-in is not configured. Add{" "}
            <code className="font-mono text-xs">AUTH_GOOGLE_ID</code> and{" "}
            <code className="font-mono text-xs">AUTH_GOOGLE_SECRET</code>, then
            open <Link href="/login">/login</Link>.
          </p>
        )}
      </main>
    </div>
  );
}
