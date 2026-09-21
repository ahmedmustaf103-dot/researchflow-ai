"use client";

import { useEffect, useMemo, useState } from "react";
import type { ResearchProjectDetail } from "@/lib/research/types";
import { isTerminalStatus } from "@/lib/research/status";
import { buildResearchTrace } from "@/lib/research/trace";
import type { ResearchTrace } from "@/lib/research/trace-types";
import {
  isMcpSourceUrl,
  sourcePrimaryLabel,
  sourceToolLabel,
  sourceToolTechnicalName,
} from "@/lib/research/source-display";
import { ResearchTraceView } from "@/components/research/research-trace";
import { ReportMarkdown } from "@/components/research/report-markdown";

type DetailPayload = ResearchProjectDetail & {
  trace?: ResearchTrace;
};

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

  const trace = useMemo(() => {
    if (detail.trace) {
      return detail.trace;
    }
    return buildResearchTrace({
      project: detail.project,
      status: detail.status,
      tasks: detail.tasks,
      sources: detail.sources,
      findings: detail.findings,
      report: detail.report,
    });
  }, [detail]);

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

      <ResearchTraceView trace={trace} />

      <section>
        <h2 className="mb-3 text-lg font-medium">Tasks</h2>
        {detail.tasks.length === 0 ? (
          <p className="text-sm text-zinc-500">No tasks yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {detail.tasks.map((task) => (
              <li
                key={task.id}
                className="rounded border border-zinc-200 p-3 dark:border-zinc-800"
              >
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
            {detail.sources.map((source) => {
              const toolLabel = sourceToolLabel(source.toolName);
              const technical = sourceToolTechnicalName(source.toolName);
              return (
                <li key={source.id}>
                  <div className="font-medium">{sourcePrimaryLabel(source)}</div>
                  {isMcpSourceUrl(source.url) ? (
                    <div className="break-all text-xs text-zinc-500">
                      {source.url}
                    </div>
                  ) : (
                    <div className="break-all text-zinc-500">{source.url}</div>
                  )}
                  {toolLabel ? (
                    <div className="text-xs text-zinc-500">
                      Tool: {toolLabel}
                      {technical ? (
                        <span className="text-zinc-400"> ({technical})</span>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
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
              <li
                key={finding.id}
                className="rounded border border-zinc-200 p-3 dark:border-zinc-800"
              >
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
          <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
            <ReportMarkdown markdown={detail.report.markdown} />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            Report will appear when the pipeline finishes.
          </p>
        )}
      </section>
    </div>
  );
}
