import { auth, isGoogleOAuthConfigured } from "@/lib/auth";
import { SignInButton } from "@/components/auth/sign-in-button";
import { SignOutButton } from "@/components/auth/sign-out-button";

export default async function HomePage() {
  const session = await auth();
  const googleEnabled = isGoogleOAuthConfigured();

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <main className="w-full max-w-xl space-y-8 text-center">
        <p className="text-sm font-medium tracking-wide text-zinc-500 uppercase">
          Foundation
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">ResearchFlow AI</h1>
        <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          An AI-powered Business & Market Research Analyst. This phase is the
          application foundation — research features come next.
        </p>

        {session?.user ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Signed in as {session.user.email ?? session.user.name}
            </p>
            <SignOutButton />
          </div>
        ) : googleEnabled ? (
          <div className="flex justify-center">
            <SignInButton />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            Google sign-in is not configured. Add{" "}
            <code className="font-mono text-xs">AUTH_GOOGLE_ID</code> and{" "}
            <code className="font-mono text-xs">AUTH_GOOGLE_SECRET</code> to
            enable it.
          </p>
        )}
      </main>
    </div>
  );
}
