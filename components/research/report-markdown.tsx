import type { ReactNode } from "react";
import {
  isMcpSourceUrl,
  MCP_FIXTURE_NOTE,
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
            <span className="mt-0.5 block text-xs font-normal text-zinc-500">
              Company Profile · MCP. {MCP_FIXTURE_NOTE}
            </span>
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

const REPORT_DISCLAIMER_TEXT =
  "Research intelligence grounded in retrieved sources. This is not investment, valuation, or transaction advice.";

function headingClass(level: number): string {
  switch (level) {
    case 1:
      return "text-2xl font-semibold tracking-tight";
    case 2:
      return "mt-8 border-t border-zinc-200 pt-4 text-lg font-medium dark:border-zinc-800";
    default:
      return "mt-4 border-l-2 border-zinc-300 pl-3 text-sm font-semibold dark:border-zinc-700";
  }
}

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|");
}

function isSeparatorRow(line: string): boolean {
  return /^\|\s*:?-{3,}.*\|$/.test(line.trim());
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isQuoteLine(line: string): boolean {
  return /^>\s?/.test(line);
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

    if (isTableLine(line)) {
      const rows: string[][] = [];
      while (i < lines.length && isTableLine(lines[i] ?? "")) {
        const current = lines[i] ?? "";
        if (!isSeparatorRow(current)) {
          rows.push(tableCells(current));
        }
        i += 1;
      }
      const [header, ...body] = rows;
      if (header && header.length > 0) {
        blocks.push(
          <div key={key++} className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {header.map((cell, index) => (
                    <th
                      key={index}
                      className="border border-zinc-200 px-2 py-1.5 text-left font-medium dark:border-zinc-800"
                    >
                      {renderInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="border border-zinc-200 px-2 py-1.5 align-top text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"
                      >
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      continue;
    }

    if (isQuoteLine(line)) {
      const quoted: string[] = [];
      while (i < lines.length && isQuoteLine(lines[i] ?? "")) {
        quoted.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={key++}
          className="border-l-2 border-zinc-300 pl-3 text-sm leading-7 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
        >
          {renderInline(quoted.join(" "))}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul key={key++} className="list-disc space-y-1.5 pl-5 text-sm leading-6">
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
        <ol key={key++} className="list-decimal space-y-1.5 pl-5 text-sm leading-6">
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
      !/^\d+\.\s+/.test(lines[i] ?? "") &&
      !isTableLine(lines[i] ?? "") &&
      !isQuoteLine(lines[i] ?? "")
    ) {
      paragraphLines.push(lines[i] ?? "");
      i += 1;
    }
    const paragraph = paragraphLines.join(" ");
    const isDisclaimer = paragraph.trim() === REPORT_DISCLAIMER_TEXT;
    const question = /^\*\*Question:\*\*\s*(.*)$/.exec(paragraph.trim());
    if (isDisclaimer) {
      blocks.push(
        <p
          key={key++}
          className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
        >
          {REPORT_DISCLAIMER_TEXT}
        </p>,
      );
    } else if (question) {
      blocks.push(
        <p key={key++} className="text-sm leading-7">
          <span className="block text-[11px] uppercase tracking-wide text-zinc-500">
            Research question
          </span>
          <span className="text-zinc-800 dark:text-zinc-200">
            {renderInline(question[1] ?? "")}
          </span>
        </p>,
      );
    } else {
      blocks.push(
        <p
          key={key++}
          className="text-sm leading-7 text-zinc-700 dark:text-zinc-300"
        >
          {renderInline(paragraph)}
        </p>,
      );
    }
  }

  return <div className="space-y-3">{blocks}</div>;
}
