import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Copy, FileText, Brain, Network, BookOpen, Layers, Wrench, X, Pencil, RotateCcw, RefreshCw } from 'lucide-react';

import type { PromptDebugState } from '../../hooks/useLiveAPI.js';

/**
 * PromptInspectorPanel — Inspecteur du prompt système + contexte.
 *
 * Affiche, en lecture seule, le payload EXACT injecté dans la session Gemini
 * Live (émis par le serveur via le message WS `prompt_debug`) :
 *   - Prompt système compilé (base, safety, agents, autonomy…)
 *   - Mémoire contextuelle (RAG)
 *   - Contexte Knowledge System
 *   - Contexte Notebook
 *   - Vue combinée (ce qui part réellement au modèle)
 *   - Liste des outils déclarés
 *
 * N'affiche jamais de valeurs sensibles côté serveur : seul le texte déjà
 * assemblé dans le prompt est transmis.
 */

type TabId = 'system' | 'memory' | 'knowledge' | 'notebook' | 'combined' | 'tools';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  /** Nombre de caractères du bloc (pour le badge). */
  chars: number;
}

interface PromptInspectorPanelProps {
  promptDebug: PromptDebugState | null;
  connected: boolean;
  onClose: () => void;
  /**
   * Largeur (px) occupée par le ChatPanel sur le bord droit de l'écran.
   * L'inspecteur réserve cette largeur à sa droite pour s'ouvrir « à côté »
   * du chat sans le recouvrir. Ignoré si `chatFullscreen` est vrai.
   */
  chatWidth: number;
  /** Le ChatPanel est en plein écran : l'inspecteur se superpose alors en pleine largeur. */
  chatFullscreen: boolean;
  /** Applique une édition du prompt système à la conversation en cours (surcouche). */
  onApplyOverride: (text: string, opts?: { reset?: boolean }) => void;
  /** État de l'override actif pour cette conversation (null = aucun). */
  override: { applied: boolean; chars: number; truncated: boolean; at: string } | null;
  /** Remplace intégralement le prompt système (reconnexion de la session). */
  onReplace: (text: string, opts?: { reset?: boolean }) => void;
  /** État du remplacement complet actif (null = aucun). */
  replaced: { applied: boolean; chars: number; truncated: boolean; at: string } | null;
}

function formatChars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function PromptInspectorPanel({
  promptDebug,
  connected,
  onClose,
  chatWidth,
  chatFullscreen,
  onApplyOverride,
  override,
  onReplace,
  replaced,
}: PromptInspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('system');
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const tabs = useMemo<TabDef[]>(() => {
    if (!promptDebug) return [];
    const s = promptDebug.stats;
    return [
      { id: 'system',    label: 'Système',   icon: <FileText size={13} />, chars: s.systemChars },
      { id: 'memory',    label: 'Mémoire',   icon: <Brain size={13} />,    chars: s.memoryChars },
      { id: 'knowledge', label: 'Knowledge', icon: <Network size={13} />,  chars: s.knowledgeChars },
      { id: 'notebook',  label: 'Notebook',  icon: <BookOpen size={13} />, chars: s.notebookChars },
      { id: 'combined',  label: 'Combiné',   icon: <Layers size={13} />,   chars: s.combinedChars },
      { id: 'tools',     label: 'Outils',    icon: <Wrench size={13} />,   chars: promptDebug.tools.length },
    ];
  }, [promptDebug]);

  const activeText = useMemo(() => {
    if (!promptDebug) return '';
    switch (activeTab) {
      case 'system':    return promptDebug.systemText;
      case 'memory':    return promptDebug.memoryContext;
      case 'knowledge': return promptDebug.knowledgeContext;
      case 'notebook':  return promptDebug.notebookContext;
      case 'combined':  return promptDebug.combined;
      case 'tools':     return promptDebug.tools.join('\n');
      default:          return '';
    }
  }, [promptDebug, activeTab]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponible — silencieux */
    }
  };

  // Marge réservée à droite = largeur du ChatPanel, sauf s'il est en plein
  // écran (l'inspecteur se superpose alors par-dessus, à gauche).
  const rightReserve = chatFullscreen ? 0 : chatWidth;

  return (
      <motion.div
        className="fixed top-0 bottom-0 flex flex-col overflow-hidden z-[9992]"
        initial={{ x: '100%', opacity: 0.4 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0.4 }}
        transition={{ type: 'spring', bounce: 0.14, duration: 0.4 }}
        style={{
          right: rightReserve,
          left: 0,
          backgroundColor: 'var(--bg-panel)',
          borderRight: '1px solid var(--border-base)',
          boxShadow: '4px 0 32px rgba(0,0,0,0.28), 1px 0 0 var(--border-base)',
          backdropFilter: 'blur(24px)',
        }}
      >
        {/* ── Header ───────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-base)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={15} style={{ color: 'var(--accent-primary)' }} />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                Inspecteur du prompt système &amp; contexte
              </span>
              {promptDebug && (
                <span className="text-xs truncate" style={{ color: 'var(--text-dimmed)' }}>
                  Mode {promptDebug.mode} · ~{formatChars(promptDebug.stats.combinedTokensEst)} tokens ·{' '}
                  {new Date(promptDebug.generatedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-active)]"
            title="Fermer"
            aria-label="Fermer l'inspecteur"
          >
            <X size={15} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* ── Corps ────────────────────────────────────────────── */}
        {!promptDebug ? (
          <div className="flex-1 flex items-center justify-center px-6 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {connected
                ? 'En attente du snapshot du prompt… il est émis à l\u2019ouverture de la session.'
                : 'Connecte la session pour capturer le prompt système et le contexte injectés au modèle.'}
            </p>
          </div>
        ) : (
          <>
            {/* Onglets */}
            <div
              className="flex items-center gap-1 px-3 py-2 flex-shrink-0 overflow-x-auto custom-scrollbar"
              style={{ borderBottom: '1px solid var(--border-base)' }}
            >
              {tabs.map((tab) => {
                const isActive = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
                    style={{
                      backgroundColor: isActive
                        ? 'color-mix(in srgb, var(--accent-primary) 14%, transparent)'
                        : 'transparent',
                      color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {tab.icon}
                    {tab.label}
                    <span
                      className="px-1.5 py-0.5 rounded-full text-[10px] leading-none"
                      style={{
                        backgroundColor: 'var(--bg-active)',
                        color: 'var(--text-dimmed)',
                      }}
                    >
                      {tab.id === 'tools' ? tab.chars : formatChars(tab.chars)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Barre d'action */}
            <div className="flex items-center justify-between gap-2 px-4 py-2 flex-shrink-0">
              <span className="text-xs truncate" style={{ color: 'var(--text-dimmed)' }}>
                {activeTab === 'tools'
                  ? `${promptDebug.tools.length} outil(s) déclaré(s)`
                  : editing
                    ? `${formatChars(draft.length)} car. — édition`
                    : activeText.length === 0
                      ? 'Bloc vide'
                      : `${formatChars(activeText.length)} caractères`}
                {activeTab === 'system' && !editing && replaced?.applied && (
                  <span className="ml-2" style={{ color: 'var(--accent-primary)' }}>
                    · prompt remplacé ({formatChars(replaced.chars)} car.)
                  </span>
                )}
                {activeTab === 'system' && !editing && !replaced?.applied && override?.applied && (
                  <span className="ml-2" style={{ color: 'var(--accent-primary)' }}>
                    · surcouche active ({formatChars(override.chars)} car.)
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {activeTab === 'system' && !editing && (
                  <button
                    type="button"
                    onClick={() => { setDraft(promptDebug.systemText); setEditing(true); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ backgroundColor: 'var(--bg-active)', color: 'var(--text-muted)' }}
                    title="Modifier le prompt système pour cette conversation"
                  >
                    <Pencil size={12} />
                    Éditer
                  </button>
                )}
                {activeTab === 'system' && !editing && (override?.applied || replaced?.applied) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (replaced?.applied) onReplace('', { reset: true });
                      if (override?.applied) onApplyOverride('', { reset: true });
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ backgroundColor: 'var(--bg-active)', color: 'var(--text-muted)' }}
                    title="Revenir au prompt système d'origine"
                  >
                    <RotateCcw size={12} />
                    Réinitialiser
                  </button>
                )}
                {activeTab === 'system' && editing && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setEditing(false); setDraft(''); }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ backgroundColor: 'var(--bg-active)', color: 'var(--text-muted)' }}
                    >
                      <X size={12} />
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={() => { onApplyOverride(draft); setEditing(false); }}
                      disabled={!connected}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                      style={{ backgroundColor: 'var(--bg-active)', color: 'var(--text-muted)' }}
                      title={connected ? 'Ajouter comme directive sans couper la session (surcouche)' : 'Session déconnectée'}
                    >
                      <Check size={12} />
                      Appliquer
                    </button>
                    <button
                      type="button"
                      onClick={() => { onReplace(draft); setEditing(false); }}
                      disabled={!connected}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--accent-primary) 18%, transparent)',
                        color: 'var(--accent-primary)',
                      }}
                      title={connected ? 'Remplacer intégralement le prompt système (reconnecte la session)' : 'Session déconnectée'}
                    >
                      <RefreshCw size={12} />
                      Remplacer
                    </button>
                  </>
                )}
                {!editing && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={activeText.length === 0}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                    style={{
                      backgroundColor: 'var(--bg-active)',
                      color: copied ? 'var(--accent-primary)' : 'var(--text-muted)',
                    }}
                    title="Copier le contenu de l'onglet"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copié' : 'Copier'}
                  </button>
                )}
              </div>
            </div>

            {/* Contenu */}
            <div className="flex-1 min-h-0 overflow-auto px-4 pb-4 custom-scrollbar">
              {activeTab === 'system' && editing ? (
                <div className="flex flex-col h-full gap-2">
                  <p className="text-xs flex-shrink-0" style={{ color: 'var(--text-dimmed)' }}>
                    <strong style={{ color: 'var(--text-muted)' }}>Appliquer</strong> : ajoute ton texte comme directive prioritaire sans couper la session (surcouche).{' '}
                    <strong style={{ color: 'var(--text-muted)' }}>Remplacer</strong> : réécrit intégralement le prompt système et reconnecte la session.
                    Dans les deux cas, les garde-fous de sécurité restent actifs. Réinitialise pour revenir au prompt d'origine.
                  </p>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    spellCheck={false}
                    className="flex-1 min-h-0 w-full resize-none rounded-lg p-3 text-xs font-mono leading-relaxed custom-scrollbar outline-none"
                    style={{
                      backgroundColor: 'var(--bg-base)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--accent-primary)',
                    }}
                  />
                </div>
              ) : activeTab === 'tools' ? (
                promptDebug.tools.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Aucun outil déclaré pour cette session.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {promptDebug.tools.map((tool) => (
                      <span
                        key={tool}
                        className="px-2 py-1 rounded-md text-xs font-mono"
                        style={{
                          backgroundColor: 'var(--bg-active)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-base)',
                        }}
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                )
              ) : activeText.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Ce bloc est vide pour la session courante.
                </p>
              ) : (
                <pre
                  className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {activeText}
                </pre>
              )}
            </div>
          </>
        )}
      </motion.div>
  );
}

export default PromptInspectorPanel;
