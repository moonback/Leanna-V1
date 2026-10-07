/**
 * Rendu markdown des messages de chat. Extrait verbatim de NotebookChat.
 * (Les classes Tailwind éventuellement « collées » sont conservées telles
 *  quelles pour ne pas altérer le rendu existant.)
 */

import { type JSX } from 'react';
import { MermaidDiagram } from '../MermaidDiagram.js';

/** Rich markdown rendering for chat messages */
export function renderMessageContent(content: string): JSX.Element {
  // Split by code blocks first
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const lines = part.slice(3, -3).split('\n');
          const lang = lines[0]?.trim().toLowerCase() || '';
          const code = (lang ? lines.slice(1) : lines).join('\n').trim();

          // Render Mermaid diagrams
          if (lang === 'mermaid') {
            return <MermaidDiagram key={i} code={code} id={`chat-${i}`} />;
          }

          return (
            <div key={i} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--notebook-border)' }}>
              {/* Code block header with language tag */}
              {lang && (
                <div
                  className="flex items-center justify-between px-3 py-1.5"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-base)' }}
                >
                  <span className="text-smfont-mono font-medium uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                    {lang}
                  </span>
                </div>
              )}
              <pre
                className="px-4 py-3 text-smoverflow-x-auto font-mono leading-relaxed"
                style={{ backgroundColor: 'var(--bg-base)', margin: 0 }}
              >
                <code style={{ color: 'var(--text-secondary)' }}>{code}</code>
              </pre>
            </div>
          );
        }

        // Process block-level markdown
        const lines = part.split('\n');
        const blocks: JSX.Element[] = [];
        let blockIdx = 0;
        let inBlockquote = false;
        let blockquoteLines: string[] = [];
        let inTable = false;
        let tableRows: string[] = [];

        const flushBlockquote = () => {
          if (blockquoteLines.length > 0) {
            blocks.push(
              <blockquote
                key={`bq-${blockIdx++}`}
                className="pl-3 py-1.5 my-1 rounded-r-lg"
                style={{
                  borderLeft: '3px solid var(--accent-primary)',
                  backgroundColor: 'var(--accent-subtle)',
                }}
              >
                {blockquoteLines.map((line, j) => (
                  <p key={j} className="text-smleading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {renderInlineMarkdown(line)}
                  </p>
                ))}
              </blockquote>
            );
            blockquoteLines = [];
          }
          inBlockquote = false;
        };

        const flushTable = () => {
          if (tableRows.length > 0) {
            const headerRow = tableRows[0].split('|').filter(c => c.trim());
            const dataRows = tableRows.slice(2).map(row => row.split('|').filter(c => c.trim()));

            blocks.push(
              <div key={`tbl-${blockIdx++}`} className="overflow-x-auto my-2 rounded-lg" style={{ border: '1px solid var(--border-base)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      {headerRow.map((cell, ci) => (
                        <th key={ci} className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-base)' }}>
                          {cell.trim()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: ri < dataRows.length - 1 ? '1px solid var(--border-base)' : 'none' }}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>
                            {renderInlineMarkdown(cell.trim())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
            tableRows = [];
          }
          inTable = false;
        };

        for (let j = 0; j < lines.length; j++) {
          const line = lines[j];

          // Table detection
          if (line.includes('|') && line.trim().startsWith('|')) {
            if (!inTable) {
              flushBlockquote();
              inTable = true;
            }
            tableRows.push(line);
            continue;
          } else if (inTable) {
            flushTable();
          }

          // Blockquote
          if (line.startsWith('>')) {
            if (!inBlockquote) {
              inBlockquote = true;
            }
            blockquoteLines.push(line.replace(/^>\s?/, ''));
            continue;
          } else if (inBlockquote) {
            flushBlockquote();
          }

          // Empty line
          if (!line.trim()) {
            blocks.push(<div key={`sp-${blockIdx++}`} className="h-2" />);
            continue;
          }

          // Horizontal rule
          if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
            blocks.push(
              <hr key={`hr-${blockIdx++}`} className="my-3 border-none" style={{ height: '1px', backgroundColor: 'var(--border-base)' }} />
            );
            continue;
          }

          // Headers
          if (line.startsWith('#### ')) {
            blocks.push(
              <h4 key={`h4-${blockIdx++}`} className="text-smfont-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>
                {renderInlineMarkdown(line.slice(5))}
              </h4>
            );
            continue;
          }
          if (line.startsWith('### ')) {
            blocks.push(
              <h3 key={`h3-${blockIdx++}`} className="text-smfont-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>
                {renderInlineMarkdown(line.slice(4))}
              </h3>
            );
            continue;
          }
          if (line.startsWith('## ')) {
            blocks.push(
              <h2 key={`h2-${blockIdx++}`} className="text-sm font-bold mt-4 mb-1.5" style={{ color: 'var(--text-primary)' }}>
                {renderInlineMarkdown(line.slice(3))}
              </h2>
            );
            continue;
          }
          if (line.startsWith('# ')) {
            blocks.push(
              <h1 key={`h1-${blockIdx++}`} className="text-sm font-bold mt-4 mb-1.5" style={{ color: 'var(--text-primary)' }}>
                {renderInlineMarkdown(line.slice(2))}
              </h1>
            );
            continue;
          }

          // Unordered lists
          if (line.match(/^[-*]\s/)) {
            blocks.push(
              <div key={`ul-${blockIdx++}`} className="flex gap-2.5 pl-2 my-0.5">
                <span
                  className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: 'var(--accent-primary)', opacity: 0.7 }}
                />
                <span className="text-smleading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>
                  {renderInlineMarkdown(line.slice(2))}
                </span>
              </div>
            );
            continue;
          }

          // Ordered lists
          if (line.match(/^\d+\.\s/)) {
            const num = line.match(/^(\d+)\./)?.[1];
            blocks.push(
              <div key={`ol-${blockIdx++}`} className="flex gap-2.5 pl-2 my-0.5">
                <span
                  className="text-smfont-bold min-w-[16px] mt-[2px] flex-shrink-0 text-center rounded"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  {num}
                </span>
                <span className="text-smleading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>
                  {renderInlineMarkdown(line.replace(/^\d+\.\s/, ''))}
                </span>
              </div>
            );
            continue;
          }

          // Regular paragraph
          blocks.push(
            <p key={`p-${blockIdx++}`} className="text-smleading-[1.7]" style={{ color: 'var(--text-secondary)' }}>
              {renderInlineMarkdown(line)}
            </p>
          );
        }

        // Flush remaining
        if (inBlockquote) flushBlockquote();
        if (inTable) flushTable();

        return <div key={i}>{blocks}</div>;
      })}
    </div>
  );
}

/** Render inline markdown: **bold**, *italic*, `code`, [links](url) */
export function renderInlineMarkdown(text: string): (string | JSX.Element)[] {
  const tokens: (string | JSX.Element)[] = [];
  // Regex to match inline elements
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    // Push text before this match
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      tokens.push(
        <strong key={`b-${keyIdx++}`} className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // *italic*
      tokens.push(
        <em key={`i-${keyIdx++}`} className="italic" style={{ color: 'var(--text-secondary)' }}>
          {match[4]}
        </em>
      );
    } else if (match[5]) {
      // `inline code`
      tokens.push(
        <code
          key={`c-${keyIdx++}`}
          className="px-1.5 py-0.5 rounded text-smfont-mono"
          style={{ backgroundColor: 'rgba(0,0,0,0.15)', border: '1px solid var(--border-base)' }}
        >
          {match[6]}
        </code>
      );
    } else if (match[7]) {
      // [text](url)
      tokens.push(
        <a
          key={`a-${keyIdx++}`}
          href={match[9]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:opacity-80 transition-opacity"
          style={{ color: 'var(--accent-primary)' }}
        >
          {match[8]}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }

  return tokens.length > 0 ? tokens : [text];
}
