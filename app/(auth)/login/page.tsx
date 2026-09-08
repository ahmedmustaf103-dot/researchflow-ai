import { redirect } from "next/navigation";
import { auth, isGoogleOAuthConfigured } from "@/lib/auth";
import { SignInButton } from "@/components/auth/sign-in-button";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/");
  }

  const googleEnabled = isGoogleOAuthConfigured();

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <main className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Use Google to access ResearchFlow AI.
        </p>
        {googleEnabled ? (
          <div className="flex justify-center">
            <SignInButton />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            Google OAuth is not configured on this environment.
          </p>
        )}
      </main>
    </div>
  );
}
