import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";
import Link from "next/link";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold">
            ResearchFlow AI
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Dashboard
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">
            {session.user.email ?? session.user.name}
          </span>
          <SignOutButton />
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
