"use client";

import { useEffect, useState } from "react";
import type { ResearchProjectDetail, ResearchStage, ResearchStatus } from "@/lib/research/types";
import { RESEARCH_STAGES } from "@/lib/research/types";
import { isTerminalStatus } from "@/lib/research/status";

type DetailPayload = ResearchProjectDetail;

const STAGE_LABELS: Record<ResearchStage, string> = {
  plan: "Plan",
  search: "Search",
  retrieve: "Retrieve",
  enrich: "Enrich",
  extract: "Extract",
  verify: "Verify",
  analyse: "Analyse",
  report: "Report",
};

function stagesCompleted(status: ResearchStatus): ResearchStage[] {
  switch (status) {
    case "queued":
      return [];
    case "planning":
      return [];
    case "researching":
      return ["plan"];
    case "verifying":
      return ["plan", "search", "retrieve", "enrich", "extract"];
    case "analysing":
      return ["plan", "search", "retrieve", "enrich", "extract", "verify"];
    case "reporting":
      return [
        "plan",
        "search",
        "retrieve",
        "enrich",
        "extract",
        "verify",
        "analyse",
      ];
    case "completed":
      return [...RESEARCH_STAGES];
    case "failed":
    case "cancelled":
      return [];
    default:
      return [];
  }
}

export function ResearchProjectView({
  projectId,
  initial,
}: {
  projectId: string;
  initial: DetailPayload;
}) {
  const [detail, setDetail] = useState(initial);

  useEffect(() => {
    if (isTerminalStatus(detail.status)) {
      return;
    }

    let cancelled = false;

    async function poll() {
      const response = await fetch(`/api/research/${projectId}`);
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as DetailPayload;
      if (!cancelled) {
        setDetail(payload);
      }
    }

    const interval = window.setInterval(() => {
      void poll();
    }, 750);

    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [detail.status, projectId]);

  const done = new Set(stagesCompleted(detail.status));
  if (detail.tasks.length > 0) done.add("plan");
  if (detail.sources.length > 0) done.add("search");
  if (detail.sources.some((source) => source.content)) done.add("retrieve");
  if (detail.findings.length > 0) done.add("extract");
  if (detail.report) {
    for (const stage of RESEARCH_STAGES) {
      done.add(stage);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-6 py-8">
      <section className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-zinc-500">
          {detail.project.status}
        </p>
        <h1 className="text-2xl font-semibold">{detail.project.title}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{detail.project.question}</p>
        {detail.project.errorMessage ? (
          <p className="text-sm text-red-600">{detail.project.errorMessage}</p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Stages</h2>
        <ol className="space-y-2">
          {RESEARCH_STAGES.map((stage) => (
            <li key={stage} className="flex items-center gap-2 text-sm">
              <span>{done.has(stage) ? "✓" : "○"}</span>
              <span>{STAGE_LABELS[stage]}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Tasks</h2>
        {detail.tasks.length === 0 ? (
          <p className="text-sm text-zinc-500">No tasks yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {detail.tasks.map((task) => (
              <li key={task.id} className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="font-medium">{task.title}</div>
                <div className="text-zinc-500">{task.status}</div>
                <div>{task.query}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Sources</h2>
        {detail.sources.length === 0 ? (
          <p className="text-sm text-zinc-500">No sources yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {detail.sources.map((source) => (
              <li key={source.id}>
                <div className="font-medium">{source.title}</div>
                <div className="text-zinc-500">{source.url}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Findings</h2>
        {detail.findings.length === 0 ? (
          <p className="text-sm text-zinc-500">No findings yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {detail.findings.map((finding) => (
              <li key={finding.id} className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="font-medium">
                  {finding.subject} — {finding.attribute}
                </div>
                <div>{finding.value}</div>
                <div className="text-zinc-500">“{finding.quote}”</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Report</h2>
        {detail.report ? (
          <pre className="whitespace-pre-wrap rounded border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            {detail.report.markdown}
          </pre>
        ) : (
          <p className="text-sm text-zinc-500">Report will appear when the pipeline finishes.</p>
        )}
      </section>
    </div>
  );
}
