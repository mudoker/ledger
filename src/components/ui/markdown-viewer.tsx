'use client';

import React, { useMemo } from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle, Info } from 'lucide-react';

interface MarkdownViewerProps {
  content: string;
  className?: string;
  hideFirstH1?: boolean;
}

type Block =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'h4'; text: string }
  | { type: 'hr' }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: { num: string; text: string }[] }
  | { type: 'dateBadge'; text: string }
  | { type: 'callout'; variant: 'info' | 'warning' | 'alert' | 'success'; title?: string; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'p'; text: string };

function renderInline(text: string): React.ReactNode {
  // Regex to match markdown links [text](url), bold **text**, inline code `code`, emails, and URLs
  const regex = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})|(https?:\/\/[^\s)]+))/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }

    if (match[2] && match[3]) {
      // [text](url)
      elements.push(
        <a
          key={match.index}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline font-semibold"
        >
          {match[2]}
        </a>
      );
    } else if (match[4]) {
      // **bold**
      elements.push(
        <strong key={match.index} className="font-semibold text-foreground">
          {match[4]}
        </strong>
      );
    } else if (match[5]) {
      // `code`
      elements.push(
        <code
          key={match.index}
          className="px-1.5 py-0.5 rounded bg-muted/80 font-mono text-[11px] text-foreground border border-border/50"
        >
          {match[5]}
        </code>
      );
    } else if (match[6]) {
      // email
      elements.push(
        <a
          key={match.index}
          href={`mailto:${match[6]}`}
          className="text-primary hover:underline font-semibold"
        >
          {match[6]}
        </a>
      );
    } else if (match[7]) {
      // URL
      elements.push(
        <a
          key={match.index}
          href={match[7]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline font-semibold break-all"
        >
          {match[7]}
        </a>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements.length === 1 ? elements[0] : elements;
}

export function parseMarkdownBlocks(content: string, hideFirstH1 = false): Block[] {
  const rawLines = content.split('\n');
  const parsedBlocks: Block[] = [];
  let currentUl: string[] | null = null;
  let currentOl: { num: string; text: string }[] | null = null;
  let currentTable: string[] | null = null;
  let currentCallout: { variant: 'info' | 'warning' | 'alert' | 'success'; title?: string; lines: string[] } | null = null;
  let isFirstH1 = true;

  const flushLists = () => {
    if (currentUl) {
      parsedBlocks.push({ type: 'ul', items: currentUl });
      currentUl = null;
    }
    if (currentOl) {
      parsedBlocks.push({ type: 'ol', items: currentOl });
      currentOl = null;
    }
  };

  const flushTable = () => {
    if (currentTable && currentTable.length >= 2) {
      const parseRow = (line: string) =>
        line
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());

      const headers = parseRow(currentTable[0]);
      // Skip row 1 if it's the divider |--|--|
      const contentRows = currentTable
        .slice(1)
        .filter((line) => !/^[|\s-:]+$/.test(line))
        .map(parseRow);

      parsedBlocks.push({ type: 'table', headers, rows: contentRows });
    }
    currentTable = null;
  };

  const flushCallout = () => {
    if (currentCallout) {
      parsedBlocks.push({
        type: 'callout',
        variant: currentCallout.variant,
        title: currentCallout.title,
        text: currentCallout.lines.join(' '),
      });
      currentCallout = null;
    }
  };

  const flushAll = () => {
    flushLists();
    flushTable();
    flushCallout();
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();

    if (!line) {
      flushAll();
      continue;
    }

    // Callout / Blockquote: > ...
    if (line.startsWith('>')) {
      flushLists();
      flushTable();
      const calloutText = line.replace(/^>\s*/, '');
      let variant: 'info' | 'warning' | 'alert' | 'success' = 'info';
      let title: string | undefined;
      let cleanText = calloutText;

      if (/^\[!(WARNING|CAUTION)\]/i.test(calloutText)) {
        variant = 'warning';
        title = 'Financial & Regulatory Warning';
        cleanText = calloutText.replace(/^\[!(WARNING|CAUTION)\]\s*/i, '');
      } else if (/^\[!(ALERT|IMPORTANT)\]/i.test(calloutText)) {
        variant = 'alert';
        title = 'Important Legal Requirement';
        cleanText = calloutText.replace(/^\[!(ALERT|IMPORTANT)\]\s*/i, '');
      } else if (/^\[!(NOTE|TIP|INFO)\]/i.test(calloutText)) {
        variant = 'info';
        title = 'Notice & Compliance Policy';
        cleanText = calloutText.replace(/^\[!(NOTE|TIP|INFO)\]\s*/i, '');
      } else if (/^\*\*(Financial Disclaimer|Disclaimer|Important|Notice|Lưu ý|Khuyến cáo):?\*\*/i.test(calloutText)) {
        variant = 'warning';
        const m = calloutText.match(/^\*\*([^:*]+):?\*\*\s*(.*)/i);
        if (m) {
          title = m[1];
          cleanText = m[2];
        }
      }

      if (!currentCallout) {
        currentCallout = { variant, title, lines: [cleanText] };
      } else {
        currentCallout.lines.push(cleanText);
      }
      continue;
    } else {
      flushCallout();
    }

    // Table rows: | col1 | col2 |
    if (line.startsWith('|') && line.endsWith('|')) {
      flushLists();
      if (!currentTable) currentTable = [];
      currentTable.push(line);
      continue;
    } else {
      flushTable();
    }

    // Horizontal rule: --- or ***
    if (/^(-{3,}|\*{3,})$/.test(line)) {
      flushAll();
      parsedBlocks.push({ type: 'hr' });
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      flushAll();
      if (isFirstH1 && hideFirstH1) {
        isFirstH1 = false;
        continue;
      }
      isFirstH1 = false;
      parsedBlocks.push({ type: 'h1', text: line.replace(/^#\s+/, '') });
      continue;
    }

    if (line.startsWith('## ')) {
      flushAll();
      parsedBlocks.push({ type: 'h2', text: line.replace(/^##\s+/, '') });
      continue;
    }

    if (line.startsWith('### ')) {
      flushAll();
      parsedBlocks.push({ type: 'h3', text: line.replace(/^###\s+/, '') });
      continue;
    }

    if (line.startsWith('#### ')) {
      flushAll();
      parsedBlocks.push({ type: 'h4', text: line.replace(/^####\s+/, '') });
      continue;
    }

    // Date badge: **Last updated: ...** or **Effective Date: ...**
    const dateMatch = line.match(/^\*\*(Last updated|Effective Date|Ngày cập nhật|Release Date):?\s*([^*]+)\*\*$/i);
    if (dateMatch) {
      flushAll();
      parsedBlocks.push({
        type: 'dateBadge',
        text: `${dateMatch[1]}: ${dateMatch[2].trim()}`,
      });
      continue;
    }

    // Unordered list item: - or *
    if (/^[-*]\s+/.test(line)) {
      if (currentOl) flushLists();
      if (!currentUl) currentUl = [];
      currentUl.push(line.replace(/^[-*]\s+/, ''));
      continue;
    }

    // Ordered list item: 1. 2. etc.
    const olMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (olMatch) {
      if (currentUl) flushLists();
      if (!currentOl) currentOl = [];
      currentOl.push({ num: olMatch[1], text: olMatch[2] });
      continue;
    }

    // Normal paragraph
    flushAll();
    parsedBlocks.push({ type: 'p', text: line });
  }

  flushAll();
  return parsedBlocks;
}

export function MarkdownViewer({ content, className = '', hideFirstH1 = false }: MarkdownViewerProps) {
  const blocks = useMemo(() => parseMarkdownBlocks(content, hideFirstH1), [content, hideFirstH1]);

  return (
    <div className={`space-y-3.5 text-xs leading-relaxed text-muted-foreground font-sans ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'h1':
            return (
              <h1 key={idx} className="text-base sm:text-lg font-bold text-foreground tracking-tight pt-1">
                {renderInline(block.text)}
              </h1>
            );
          case 'h2':
            return (
              <h2 key={idx} className="text-sm sm:text-base font-bold text-foreground tracking-tight pt-3 border-b border-border/40 pb-1.5">
                {renderInline(block.text)}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={idx} className="text-xs sm:text-sm font-semibold text-foreground tracking-tight pt-2.5 flex items-center gap-1.5">
                {renderInline(block.text)}
              </h3>
            );
          case 'h4':
            return (
              <h4 key={idx} className="text-xs font-semibold text-foreground pt-1.5">
                {renderInline(block.text)}
              </h4>
            );
          case 'dateBadge':
            return (
              <div key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/60 text-muted-foreground text-[11px] font-medium border border-border/40">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span>{block.text}</span>
              </div>
            );
          case 'callout': {
            const isAlert = block.variant === 'alert';
            const isWarning = block.variant === 'warning';
            const borderCol = isAlert
              ? 'border-destructive/50 bg-destructive/10 text-foreground'
              : isWarning
              ? 'border-amber-500/50 bg-amber-500/10 text-foreground'
              : 'border-primary/50 bg-primary/10 text-foreground';
            const Icon = isAlert ? AlertTriangle : isWarning ? ShieldAlert : ShieldCheck;
            const iconCol = isAlert ? 'text-destructive' : isWarning ? 'text-amber-500' : 'text-primary';

            return (
              <div key={idx} className={`p-3 sm:p-3.5 rounded-xl border ${borderCol} my-2.5 flex items-start gap-2.5 shadow-sm`}>
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconCol}`} />
                <div className="flex-1 text-xs leading-relaxed space-y-1">
                  {block.title && (
                    <div className={`font-bold text-[11px] uppercase tracking-wider ${iconCol}`}>
                      {block.title}
                    </div>
                  )}
                  <div className="text-muted-foreground leading-relaxed">
                    {renderInline(block.text)}
                  </div>
                </div>
              </div>
            );
          }
          case 'table':
            return (
              <div key={idx} className="overflow-x-auto my-3 rounded-xl border border-border/60">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/60 border-b border-border/60 font-semibold text-foreground">
                    <tr>
                      {block.headers.map((h, i) => (
                        <th key={i} className="p-2 sm:p-2.5 whitespace-nowrap">
                          {renderInline(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {block.rows.map((r, ri) => (
                      <tr key={ri} className="hover:bg-muted/20">
                        {r.map((c, ci) => (
                          <td key={ci} className="p-2 sm:p-2.5 text-muted-foreground">
                            {renderInline(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'hr':
            return <hr key={idx} className="border-t border-border/60 my-3" />;
          case 'ul':
            return (
              <ul key={idx} className="space-y-1.5 pl-1 my-2">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="flex items-start gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/80 mt-1.5 shrink-0" />
                    <span className="flex-1 leading-relaxed text-muted-foreground">{renderInline(item)}</span>
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={idx} className="space-y-1.5 pl-1 my-2">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="flex items-start gap-2 text-xs">
                    <span className="font-bold text-primary text-[11px] shrink-0 min-w-4 pt-0.5">
                      {item.num}.
                    </span>
                    <span className="flex-1 leading-relaxed text-muted-foreground">{renderInline(item.text)}</span>
                  </li>
                ))}
              </ol>
            );
          case 'p':
            return (
              <p key={idx} className="text-xs leading-relaxed text-muted-foreground">
                {renderInline(block.text)}
              </p>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
