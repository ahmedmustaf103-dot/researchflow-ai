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
        <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
          ResearchFlow plans complex questions with Gemini, gathers evidence
          through web tools, enriches results through MCP, validates quotes and
          citations, and exposes the process through a Research Trace.
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
