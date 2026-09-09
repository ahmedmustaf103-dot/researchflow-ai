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
        <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          An AI-powered Business & Market Research Analyst. Sign in to start a
          research project.
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
