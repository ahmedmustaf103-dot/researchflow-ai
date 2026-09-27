"use client";

import { useEffect, useMemo, useState } from "react";
import type { ResearchProjectDetail } from "@/lib/research/types";
import { isTerminalStatus } from "@/lib/research/status";
import { buildResearchTrace } from "@/lib/research/trace";
import type { ResearchTrace } from "@/lib/research/trace-types";
import {
  isMcpSourceUrl,
  MCP_FIXTURE_NOTE,
  sourceDomainLabel,
  sourceEvidenceKind,
  sourcePrimaryLabel,
  sourceToolLabel,
  sourceToolTechnicalName,
} from "@/lib/research/source-display";
import { ResearchTraceView } from "@/components/research/research-trace";
import { ReportMarkdown } from "@/components/research/report-markdown";
import { EvidenceBlock } from "@/components/research/evidence-block";
import type { TraceItemStatus } from "@/lib/research/trace-types";

type DetailPayload = ResearchProjectDetail & {
  trace?: ResearchTrace;
};

function progressMark(status: TraceItemStatus, current: boolean): string {
  if (status === "success") {
    return "✓";
  }
  if (status === "failed") {
    return "✕";
  }
  if (status === "rejected") {
    return "!";
  }
  if (current) {
    return "●";
  }
  return "○";
}

function isExternalLimit(message: string): boolean {
  return /429|rate limit|quota/i.test(message);
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

  const running = !isTerminalStatus(detail.status);
  const sourcesById = new Map(detail.sources.map((source) => [source.id, source]));
  const currentStageId = trace.stages.find(
    (stage) => stage.status === "pending",
  )?.id;
  const errorMessage = detail.project.errorMessage;
  const webSourceCount = detail.sources.filter(
    (source) => sourceEvidenceKind(source) === "web",
  ).length;
  const mcpSourceCount = detail.sources.filter(
    (source) => sourceEvidenceKind(source) === "mcp",
  ).length;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-6 py-8">
      <section className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-zinc-500">
          Evidence-backed brief · {detail.project.status}
        </p>
        <h1 className="text-2xl font-semibold">{detail.project.title}</h1>
        <p className="text-[11px] uppercase tracking-wide text-zinc-500">
          Research question
        </p>
        <p className="text-zinc-800 dark:text-zinc-200">{detail.project.question}</p>
        {detail.status === "failed" ? (
          <p className="text-sm font-medium text-red-600">
            This run did not finish.
          </p>
        ) : null}
        {errorMessage && isExternalLimit(errorMessage) ? (
          <p className="text-sm text-red-600">
            Stopped on an external quota or rate limit.
          </p>
        ) : null}
        {errorMessage ? (
          <p className="text-sm text-red-600">{errorMessage}</p>
        ) : null}
      </section>

      <section className="grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            Status
          </p>
          <p className="mt-1 font-medium">{detail.project.status}</p>
        </div>
        <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            Evidence
          </p>
          <p className="mt-1 font-medium">
            {detail.findings.length} quoted claim
            {detail.findings.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            Sources
          </p>
          <p className="mt-1 font-medium">
            {webSourceCount} web · {mcpSourceCount} MCP fixture
            {mcpSourceCount === 1 ? "" : "s"}
          </p>
        </div>
      </section>
      <p className="text-xs leading-5 text-zinc-500">
        Public web pages only, within the current search limits. Missing
        prices stay in gaps, and disagreements stay visible. MCP company
        profiles are local demo fixtures, not live prices, valuations, or
        investment advice.
      </p>

      {running ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Progress</h2>
          <ol className="grid gap-1 text-sm sm:grid-cols-2">
            {trace.stages.map((stage) => (
              <li key={stage.id} className="flex items-baseline gap-2">
                <span className="w-4 text-zinc-500" aria-hidden>
                  {progressMark(stage.status, stage.id === currentStageId)}
                </span>
                <span>{stage.label}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <ResearchTraceView trace={trace} />

      <section>
        <h2 className="mb-3 text-lg font-medium">Research brief</h2>
        {detail.report ? (
          <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
            <ReportMarkdown markdown={detail.report.markdown} />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            {running
              ? "The brief will appear when the pipeline finishes."
              : "No brief was recorded for this run."}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Evidence</h2>
        {detail.findings.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {running
              ? "Evidence will appear after extraction."
              : "No evidence was recorded for this brief."}
          </p>
        ) : (
          <ul className="space-y-2">
            {detail.findings.map((finding) => {
              const source = sourcesById.get(finding.sourceId);
              return (
                <li
                  key={finding.id}
                  className="rounded border border-zinc-200 p-3 dark:border-zinc-800"
                >
                  <EvidenceBlock
                    claim={finding.value}
                    quote={finding.quote}
                    detail={finding.attribute}
                    sourceTitle={source?.title}
                    sourceUrl={source?.url}
                    toolName={source?.toolName}
                  />
                </li>
              );
            })}
          </ul>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Sources ({detail.sources.length})
          </h3>
          {detail.sources.length === 0 ? (
            <p className="text-sm text-zinc-500">
              {running
                ? "Sources will appear after search."
                : "No sources were recorded."}
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {detail.sources.map((source) => {
                const kind = sourceEvidenceKind(source);
                const domain = sourceDomainLabel(source.url);
                const toolLabel = sourceToolLabel(source.toolName);
                const technical = sourceToolTechnicalName(source.toolName);
                return (
                  <li key={source.id}>
                    <div className="font-medium">{sourcePrimaryLabel(source)}</div>
                    {kind === "web" ? (
                      <div className="text-xs text-zinc-500">
                        Web source{domain ? ` · ${domain}` : ""}
                      </div>
                    ) : null}
                    {kind === "mcp" ? (
                      <div className="text-xs text-zinc-500">
                        {toolLabel ?? "Company Profile · MCP"}
                        {domain ? ` · ${domain}` : ""}
                        <span className="mt-0.5 block">{MCP_FIXTURE_NOTE}</span>
                      </div>
                    ) : null}
                    <div className="break-all text-xs text-zinc-500">
                      {isMcpSourceUrl(source.url) ||
                      !/^https?:\/\//i.test(source.url) ? (
                        source.url
                      ) : (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-700 underline underline-offset-2 dark:text-sky-400"
                        >
                          {source.url}
                        </a>
                      )}
                    </div>
                    {toolLabel && kind !== "mcp" ? (
                      <div className="text-xs text-zinc-500">
                        {toolLabel}
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
        </div>
      </section>

      <details className="text-sm">
        <summary className="cursor-pointer text-zinc-500">
          Research tasks
        </summary>
        {detail.tasks.length === 0 ? (
          <p className="mt-2 text-zinc-500">
            {running
              ? "Research tasks will appear after planning."
              : "No research tasks were recorded."}
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
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
      </details>
    </div>
  );
}
