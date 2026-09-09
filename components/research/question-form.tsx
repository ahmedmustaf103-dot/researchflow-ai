"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function QuestionForm() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };

      if (!response.ok || !payload.id) {
        setError(payload.error ?? "Could not start research.");
        return;
      }

      router.push(`/research/${payload.id}`);
      router.refresh();
    } catch {
      setError("Could not start research.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label htmlFor="question" className="block text-sm font-medium">
        Research question
      </label>
      <textarea
        id="question"
        name="question"
        required
        minLength={10}
        rows={4}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="What are the top competitors of Stripe?"
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Starting…" : "Run research"}
      </button>
    </form>
  );
}
