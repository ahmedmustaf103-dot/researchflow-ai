import type { ReactNode } from "react";
import {
  isMcpSourceUrl,
  mcpCompanyDisplayName,
} from "@/lib/research/source-display";

/**
 * Lightweight Markdown renderer for citation-backed research reports.
 * Supports headings, paragraphs, lists, links, bold, and italics.
 * No extra dependencies — report generation is unchanged.
 */

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(_([^_]+)_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1] && match[2] !== undefined && match[3] !== undefined) {
      const label = match[2];
      const href = match[3];
      if (isMcpSourceUrl(href)) {
        nodes.push(
          <span key={key++} className="font-medium">
            {`Company profile — ${mcpCompanyDisplayName(href, label)}`}
          </span>,
        );
      } else if (/^https?:\/\//i.test(href)) {
        nodes.push(
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-sky-700 underline underline-offset-2 dark:text-sky-400"
          >
            {label}
          </a>,
        );
      } else {
        nodes.push(label);
      }
    } else if (match[4] && match[5] !== undefined) {
      nodes.push(<strong key={key++}>{match[5]}</strong>);
    } else if (match[6] && match[7] !== undefined) {
      nodes.push(<em key={key++}>{match[7]}</em>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function headingClass(level: number): string {
  switch (level) {
    case 1:
      return "text-xl font-semibold tracking-tight";
    case 2:
      return "mt-6 text-lg font-medium";
    default:
      return "mt-4 text-base font-medium";
  }
}

export function ReportMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const content = heading[2]!;
      const Tag = (`h${level}` as "h1" | "h2" | "h3");
      blocks.push(
        <Tag key={key++} className={headingClass(level)}>
          {renderInline(content)}
        </Tag>,
      );
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul key={key++} className="list-disc space-y-1 pl-5 text-sm">
          {items.map((item, index) => (
            <li key={index}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ol key={key++} className="list-decimal space-y-1 pl-5 text-sm">
          {items.map((item, index) => (
            <li key={index}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !/^(#{1,3})\s+/.test(lines[i] ?? "") &&
      !/^[-*]\s+/.test(lines[i] ?? "") &&
      !/^\d+\.\s+/.test(lines[i] ?? "")
    ) {
      paragraphLines.push(lines[i] ?? "");
      i += 1;
    }
    blocks.push(
      <p
        key={key++}
        className="text-sm leading-7 text-zinc-700 dark:text-zinc-300"
      >
        {renderInline(paragraphLines.join(" "))}
      </p>,
    );
  }

  return <div className="space-y-3">{blocks}</div>;
}
