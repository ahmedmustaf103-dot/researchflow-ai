"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  composeResearchQuestion,
  DEFAULT_RESEARCH_TEMPLATE_ID,
  getResearchTemplate,
  type ResearchTemplateId,
} from "@/lib/research/templates";

const WORKFLOW_ORDER: ResearchTemplateId[] = [
  "competitor",
  "property",
  "developer",
  "area",
  "market",
];

function joinFieldLabels(labels: string[]): string {
  const words = labels.map((label) => label.toLowerCase());
  if (words.length === 1) {
    return words[0] ?? "";
  }
  if (words.length === 2) {
    return `${words[0]} and ${words[1]}`;
  }
  return `${words.slice(0, -1).join(", ")}, and ${words.at(-1)}`;
}

export function QuestionForm() {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<ResearchTemplateId>(
    DEFAULT_RESEARCH_TEMPLATE_ID,
  );
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [question, setQuestion] = useState("");
  const [questionEdited, setQuestionEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const template = getResearchTemplate(templateId);
  const composed = composeResearchQuestion(templateId, fieldValues);
  const fieldsStarted = template.fields.some(
    (field) => (fieldValues[field.id] ?? "").trim().length > 0,
  );
  const missingLabels =
    !composed.ok && fieldsStarted && !questionEdited
      ? composed.missingFieldIds.map(
          (id) => template.fields.find((field) => field.id === id)?.label ?? id,
        )
      : [];

  function selectTemplate(nextId: ResearchTemplateId) {
    if (nextId === templateId) {
      return;
    }
    setTemplateId(nextId);
    setFieldValues({});
    setQuestion("");
    setQuestionEdited(false);
    setError(null);
  }

  function updateField(fieldId: string, value: string) {
    const nextValues = { ...fieldValues, [fieldId]: value };
    setFieldValues(nextValues);
    if (questionEdited) {
      return;
    }
    const nextQuestion = composeResearchQuestion(templateId, nextValues);
    setQuestion(nextQuestion.ok ? nextQuestion.question : "");
  }

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

  const workflows = WORKFLOW_ORDER.map((id) => getResearchTemplate(id));

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-medium">Research brief</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Choose a workflow, define what you want to research, and let
          ResearchFlow gather and validate the evidence.
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Workflow</legend>
        <div
          className="grid gap-2 sm:grid-cols-2"
          role="radiogroup"
          aria-label="Research workflow"
        >
          {workflows.map((item) => {
            const selected = item.id === templateId;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => selectTemplate(item.id)}
                className={
                  selected
                    ? "rounded-md border border-zinc-900 bg-zinc-50 px-3 py-3 text-left dark:border-zinc-100 dark:bg-zinc-900"
                    : "rounded-md border border-zinc-200 px-3 py-3 text-left dark:border-zinc-800"
                }
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.id === "competitor" ? (
                    <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                      Primary demo
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs leading-5 text-zinc-500">
                  {item.description}
                </span>
              </button>
            );
          })}
        </div>
        {templateId === "competitor" ? (
          <p className="text-xs leading-5 text-zinc-500">
            Best for comparing residential developments using publicly available
            evidence.
          </p>
        ) : null}
      </fieldset>

      {template.fields.map((field) => (
        <div key={field.id} className="space-y-1">
          <label
            htmlFor={`template-${templateId}-${field.id}`}
            className="block text-sm font-medium"
          >
            {field.label}
          </label>
          <input
            id={`template-${templateId}-${field.id}`}
            name={field.id}
            value={fieldValues[field.id] ?? ""}
            onChange={(event) => updateField(field.id, event.target.value)}
            placeholder={field.placeholder}
            autoComplete="off"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>
      ))}

      {template.example ? (
        <p className="text-xs leading-5 text-zinc-500">{template.example}</p>
      ) : null}

      {missingLabels.length > 0 ? (
        <p className="text-xs leading-5 text-zinc-500">
          Add {joinFieldLabels(missingLabels)} to draft the question. You can
          also write the question yourself.
        </p>
      ) : null}

      <label htmlFor="question" className="block text-sm font-medium">
        Research question
      </label>
      <textarea
        id="question"
        name="question"
        required
        minLength={10}
        maxLength={4000}
        rows={5}
        value={question}
        onChange={(event) => {
          setQuestion(event.target.value);
          setQuestionEdited(true);
        }}
        placeholder="Edit the brief, or write your own research question."
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Starting…" : "Create brief"}
      </button>
    </form>
  );
}
