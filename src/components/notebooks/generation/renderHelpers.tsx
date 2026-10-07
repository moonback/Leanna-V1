/**
 * Helpers de rendu du sous-module Generation (style NotebookLM) :
 *  - renderGeneratedContent : markdown premium (code, mermaid, titres, listes…)
 *  - renderInfographicContent : image PNG générée + métadonnées
 *  - renderInlineMarkdown : parsing inline récursif (gras/italique/code/liens)
 *  - useReducedTransparency : hook de préférence d'accessibilité
 *
 * Extraits verbatim de GeneratePanel pour alléger le composant.
 */

import { type JSX } from 'react';
import { Copy } from 'lucide-react';
import { MermaidDiagram } from '../MermaidDiagram.js';
import { CODE_THEMES } from './constants.js';
// Styles premium NotebookLM
import '../../../styles/notebooklm.css';

/**
 * Rendu premium du contenu généré
 * Supports: markdown complet + blocs de code enrichis + images + liens + tableaux
 */
export function renderGeneratedContent(content: string): JSX.Element {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="notebooklm-prose max-w-none space-y-5">
      {parts.map((part, i) => {
        // --- BLOC DE CODE ---
        if (part.startsWith('```')) {
          const lines = part.slice(3, -3).split('\n');
          const lang = lines[0]?.trim().toLowerCase() || '';
          const codeContent = (lang ? lines.slice(1) : lines).join('\n').trim();
          const theme = CODE_THEMES.default;

          // Mermaid
          if (lang === 'mermaid') {
            return (
              <div key={i} className="notebooklm-mermaid my-6">
                <MermaidDiagram code={codeContent} id={`gen-mermaid-${i}`} />
              </div>
            );
          }

          // Blocs de code premium
          return (
            <div
              key={i}
              className="notebooklm-code rounded-xl overflow-hidden shadow-sm border group/code relative"
              style={{ borderColor: theme.border, backgroundColor: theme.bg }}
            >
              {lang && (
                <div
                  className="flex items-center gap-2 px-4 py-2.5 border-b"
                  style={{
                    borderColor: theme.border,
                    backgroundColor: `color-mix(in srgb, ${theme.bg} 95%, black)`,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  />
                  <span className="text-xs font-medium text-[var(--text-dimmed)]">
                    {lang}
                  </span>
                </div>
              )}

              <pre
                className={`p-4 overflow-x-auto font-mono text-sm leading-relaxed ${
                  lang ? '' : 'rounded-xl'
                }`}
                style={{ color: theme.text }}
              >
                <code>{codeContent}</code>
              </pre>

              <button
                onClick={() => navigator.clipboard.writeText(codeContent)}
                className="absolute top-2 right-2 p-2 rounded-lg opacity-0 group-hover/code:opacity-100 transition-opacity hover:bg-[var(--bg-active)]"
                style={{ color: 'var(--text-muted)' }}
                title="Copier"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        }

        // --- CONTENU TEXTUEL ---
        const lines = part.split('\n');
        return (
          <div key={i} className="space-y-4">
            {lines.map((line, j) => {
              if (!line.trim()) return <div key={j} className="h-2" />;

              // ========== IMAGES ==========
              const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
              if (imgMatch) {
                return (
                  <figure key={j} className="notebooklm-figure my-6">
                    <div
                      className="rounded-2xl overflow-hidden border shadow-lg"
                      style={{
                        borderColor: 'var(--border-base)',
                        backgroundColor: 'var(--bg-base)',
                      }}
                    >
                      <img
                        src={imgMatch[2]}
                        alt={imgMatch[1] || 'Image'}
                        className="w-full h-auto"
                        style={{ maxHeight: '700px', objectFit: 'contain' }}
                      />
                    </div>
                    {imgMatch[1] && (
                      <figcaption
                        className="mt-3 text-center text-xs"
                        style={{ color: 'var(--text-dimmed)' }}
                      >
                        {imgMatch[1]}
                      </figcaption>
                    )}
                  </figure>
                );
              }

              // ========== TITRES ==========
              if (line.startsWith('# '))
                return (
                  <h1 key={j} className="notebooklm-h1 text-3xl md:text-4xl font-bold mt-8 mb-4">
                    {renderInlineMarkdown(line.slice(2).trim())}
                  </h1>
                );
              if (line.startsWith('## '))
                return (
                  <h2 key={j} className="notebooklm-h2 text-2xl md:text-3xl font-bold mt-7 mb-3">
                    {renderInlineMarkdown(line.slice(3).trim())}
                  </h2>
                );
              if (line.startsWith('### '))
                return (
                  <h3 key={j} className="notebooklm-h3 text-xl md:text-2xl font-semibold mt-6 mb-2">
                    {renderInlineMarkdown(line.slice(4).trim())}
                  </h3>
                );
              if (line.startsWith('#### '))
                return (
                  <h4 key={j} className="notebooklm-h4 text-lg md:text-xl font-semibold mt-5 mb-2">
                    {renderInlineMarkdown(line.slice(5).trim())}
                  </h4>
                );
              if (line.startsWith('##### '))
                return (
                  <h5 key={j} className="notebooklm-h5 text-base font-medium mt-4 mb-1.5">
                    {renderInlineMarkdown(line.slice(6).trim())}
                  </h5>
                );
              if (line.startsWith('###### '))
                return (
                  <h6 key={j} className="notebooklm-h6 text-sm font-medium mt-3 mb-1 opacity-80">
                    {renderInlineMarkdown(line.slice(7).trim())}
                  </h6>
                );

              // ========== SÉPARATEURS ==========
              if (line.match(/^---+$/) || line.match(/^___+$/) || line.match(/^\*\*\*+$/))
                return (
                  <hr
                    key={j}
                    className="my-6 border-0 h-px"
                    style={{
                      background: 'linear-gradient(to right, transparent, var(--border-base), transparent)',
                    }}
                  />
                );

              // ========== CITATIONS ==========
              if (line.startsWith('> '))
                return (
                  <blockquote
                    key={j}
                    className="notebooklm-blockquote pl-5 pr-4 py-3 rounded-xl my-4"
                    style={{
                      borderLeft: '3px solid var(--accent-primary)',
                      backgroundColor: 'color-mix(in srgb, var(--accent-primary) 5%, transparent)',
                    }}
                  >
                    <p className="text-sm italic leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      {renderInlineMarkdown(line.slice(2).trim())}
                    </p>
                  </blockquote>
                );

              // ========== LISTES À PUCES ==========
              if (line.match(/^[-*+]\s/)) {
                const bullet = line.match(/^([-*+])\s/)![1];
                return (
                  <div key={j} className="flex gap-3 py-1.5 notebooklm-list-item">
                    <span
                      className="mt-1.5 flex-shrink-0"
                      style={{ color: 'var(--accent-primary)', opacity: 0.7 }}
                    >
                      {bullet === '*' ? '•' : bullet === '+' ? '›' : '○'}
                    </span>
                    <div className="text-sm leading-relaxed flex-1">
                      {renderInlineMarkdown(line.slice(2).trim())}
                    </div>
                  </div>
                );
              }

              // ========== LISTES NUMÉROTÉES ==========
              if (line.match(/^\d+\.\s/)) {
                const numMatch = line.match(/^(\d+)\.\s(.*)$/);
                if (numMatch)
                  return (
                    <div key={j} className="flex gap-3 py-1.5 notebooklm-list-item">
                      <span
                        className="mt-1.5 flex-shrink-0 w-6 text-right font-semibold"
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        {numMatch[1]}.
                      </span>
                      <div className="text-sm leading-relaxed flex-1">
                        {renderInlineMarkdown(numMatch[2])}
                      </div>
                    </div>
                  );
              }

              // ========== LISTES DE TÂCHES ==========
              const taskMatch = line.match(/^[-*]\s\[([xX\s])\]\s(.*)$/);
              if (taskMatch)
                return (
                  <div key={j} className="flex items-start gap-3 py-1.5 notebooklm-task">
                    <input
                      type="checkbox"
                      checked={taskMatch[1].toLowerCase() === 'x'}
                      readOnly
                      className="mt-1.5 w-4 h-4 rounded border-2 accent-[var(--accent-primary)]"
                    />
                    <span className="text-sm leading-relaxed pt-0.5">
                      {renderInlineMarkdown(taskMatch[2])}
                    </span>
                  </div>
                );

              // ========== LIENS STANDALONE ==========
              const bareLinkMatch = line.match(/^https?:\/\/[^\s]+$/);
              if (bareLinkMatch)
                return (
                  <p key={j} className="text-sm">
                    <a
                      href={line}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="notebooklm-link inline-flex items-center gap-1 font-medium"
                    >
                      {line}
                      <span className="opacity-50">↗</span>
                    </a>
                  </p>
                );

              // ========== PARAGRAPHES ==========
              return (
                <p key={j} className="text-sm leading-7 notebooklm-paragraph">
                  {renderInlineMarkdown(line)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Rendu du markdown INLINE (gras, italique, code, liens, barré)
 * Optimisé avec parsing récursif
 */
export function renderInlineMarkdown(text: string): JSX.Element {
  const parseMarkdown = (text: string, depth = 0): (string | JSX.Element)[] => {
    if (depth > 10) return [text];

    const result: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let hasMatch = false;

    const patterns: Array<{
      regex: RegExp;
      render: (content: string, fullMatch: string) => JSX.Element;
    }> = [
      {
        regex: /`([^`]+)`/g,
        render: (content) => (
          <code
            key={`${content}-code-${depth}`}
            className="notebooklm-inline-code px-1.5 py-0.5 rounded text-sm font-mono"
            style={{ backgroundColor: 'var(--bg-base)', color: 'var(--accent-primary)' }}
          >
            {content}
          </code>
        ),
      },
      {
        regex: /\[([^\]]+)\]\(([^)]+)\)/g,
        render: (content, fullMatch) => {
          const matchResult = fullMatch.match(/\[([^\]]+)\]\(([^)]+)\)/);
          const linkText = matchResult ? matchResult[1] : content;
          const url = matchResult ? matchResult[2] : content;
          return (
            <a
              key={`${url}-link-${depth}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="notebooklm-link inline-flex items-center gap-1 font-medium"
              style={{ color: 'var(--accent-primary)' }}
            >
              {parseMarkdown(linkText, depth + 1)}
              <span className="opacity-50">↗</span>
            </a>
          );
        },
      },
      {
        regex: /\*\*([^*]+)\*\*/g,
        render: (content) => (
          <strong key={`${content}-bold-${depth}`} className="font-bold">
            {parseMarkdown(content, depth + 1)}
          </strong>
        ),
      },
      {
        regex: /\*([^*]+)\*/g,
        render: (content) => (
          <em key={`${content}-italic-${depth}`} className="italic opacity-80">
            {parseMarkdown(content, depth + 1)}
          </em>
        ),
      },
      {
        regex: /~~([^~]+)~~/g,
        render: (content) => (
          <s key={`${content}-strike-${depth}`} className="line-through opacity-50">
            {parseMarkdown(content, depth + 1)}
          </s>
        ),
      },
    ];

    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        hasMatch = true;
        if (match.index > lastIndex) {
          result.push(text.slice(lastIndex, match.index));
        }
        result.push(pattern.render(match[1], match[0]));
        lastIndex = match.index + match[0].length;
      }
    }

    if (hasMatch) {
      if (lastIndex < text.length) {
        result.push(...parseMarkdown(text.slice(lastIndex), depth + 1));
      }
      return result;
    }

    return [text];
  };

  return <>{parseMarkdown(text)}</>;
}
