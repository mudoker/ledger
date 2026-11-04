'use client';

import React, { useMemo } from 'react';

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

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();

    if (!line) {
      flushLists();
      continue;
    }

    // Horizontal rule: --- or ***
    if (/^(-{3,}|\*{3,})$/.test(line)) {
      flushLists();
      parsedBlocks.push({ type: 'hr' });
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      flushLists();
      if (isFirstH1 && hideFirstH1) {
        isFirstH1 = false;
        continue;
      }
      isFirstH1 = false;
      parsedBlocks.push({ type: 'h1', text: line.replace(/^#\s+/, '') });
      continue;
    }

    if (line.startsWith('## ')) {
      flushLists();
      parsedBlocks.push({ type: 'h2', text: line.replace(/^##\s+/, '') });
      continue;
    }

    if (line.startsWith('### ')) {
      flushLists();
      parsedBlocks.push({ type: 'h3', text: line.replace(/^###\s+/, '') });
      continue;
    }

    if (line.startsWith('#### ')) {
      flushLists();
      parsedBlocks.push({ type: 'h4', text: line.replace(/^####\s+/, '') });
      continue;
    }

    // Date badge: **Last updated: ...** or **Effective Date: ...**
    const dateMatch = line.match(/^\*\*(Last updated|Effective Date|Ngày cập nhật):?\s*([^*]+)\*\*$/i);
    if (dateMatch) {
      flushLists();
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
    flushLists();
    parsedBlocks.push({ type: 'p', text: line });
  }

  flushLists();
  return parsedBlocks;
}

export function MarkdownViewer({ content, className = '', hideFirstH1 = false }: MarkdownViewerProps) {
  const blocks = useMemo(() => parseMarkdownBlocks(content, hideFirstH1), [content, hideFirstH1]);

  return (
    <div className={`space-y-3 text-xs leading-relaxed text-muted-foreground font-sans ${className}`}>
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
              <h2 key={idx} className="text-sm sm:text-base font-bold text-foreground tracking-tight pt-2">
                {renderInline(block.text)}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={idx} className="text-xs sm:text-sm font-semibold text-foreground tracking-tight pt-2 flex items-center gap-1.5">
                {renderInline(block.text)}
              </h3>
            );
          case 'h4':
            return (
              <h4 key={idx} className="text-xs font-semibold text-foreground pt-1">
                {renderInline(block.text)}
              </h4>
            );
          case 'dateBadge':
            return (
              <div key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/60 text-muted-foreground text-[11px] font-medium border border-border/40">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/70 shrink-0" />
                <span>{block.text}</span>
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
                    <span className="flex-1 leading-relaxed">{renderInline(item)}</span>
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
                    <span className="flex-1 leading-relaxed">{renderInline(item.text)}</span>
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
