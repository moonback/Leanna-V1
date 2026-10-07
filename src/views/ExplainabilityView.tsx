import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  HelpCircle, Loader2, Lightbulb, CheckCircle2, AlertTriangle, ListOrdered, Target,
  Copy, Check, RotateCcw, Gauge, ShieldAlert, ShieldCheck, ShieldOff,
} from 'lucide-react';
import { ViewHeader } from '../components/ui/ViewHeader.js';

// ─── Types mirrored from POST /api/knowledge/explain ─────────────────────────

type FactorTone = 'positive' | 'warning' | 'neutral';
interface Factor { label: string; detail: string; tone: FactorTone }
interface Prediction {
  successPercent: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendedStrategy: string[];
  playbookId?: string;
  risks: string[];
  confidence: number;
  weakestStep?: { skillName: string; failureRisk: number };
}
interface ExplainResponse {
  factors: Factor[];
  prediction: Prediction;
}

type RiskLevel = Prediction['riskLevel'];

const RISK_META: Record<RiskLevel, { color: string; label: string; icon: React.FC<{ size?: number; style?: React.CSSProperties }> }> = {
  low:      { color: 'var(--color-success)', label: 'faible',   icon: ShieldCheck },
  medium:   { color: 'var(--color-info)',    label: 'modéré',   icon: ShieldAlert },
  high:     { color: 'var(--color-warning)', label: 'élevé',    icon: ShieldAlert },
  critical: { color: 'var(--color-error)',   label: 'critique', icon: ShieldOff },
};

function toneColor(tone: FactorTone): string {
  return tone === 'positive' ? 'var(--color-success)' : tone === 'warning' ? 'var(--color-warning)' : 'var(--color-info)';
}

function successColor(pct: number): string {
  return pct >= 70 ? 'var(--color-success)' : pct >= 50 ? 'var(--color-info)' : 'var(--color-error)';
}

/** Exemples d'objectifs pour amorcer l'explication. */
const PRESETS: string[] = [
  'Corriger les erreurs TypeScript du module auth',
  'Déployer en production sans interruption',
  'Refactoriser sans casser les tests',
];

export default function ExplainabilityView() {
  const reduceMotion = useReducedMotion();
  const [objective, setObjective] = useState('');
  const [data, setData] = useState<ExplainResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const objectiveRef = useRef<HTMLTextAreaElement>(null);

  const explain = useCallback(async () => {
    if (!objective.trim()) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch('/api/knowledge/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective: objective.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) { setError(json?.error ?? "Échec de l'explication."); return; }
      setData({ factors: json.factors ?? [], prediction: json.prediction });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [objective]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void explain(); }
  }, [explain]);

  const copyData = useCallback(async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }, [data]);

  const p = data?.prediction;
  const risk = p ? RISK_META[p.riskLevel] : null;

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      <ViewHeader
        title="Explainability — Pourquoi ?"
        icon={HelpCircle}
        description="Les facteurs décisionnels derrière les choix de Leanna : probabilité, stratégie, historique, risques"
        badge="Décision"
        actions={data ? (
          <button
            type="button"
            onClick={copyData}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            style={{ backgroundColor: 'var(--bg-input)', color: copied ? 'var(--color-success)' : 'var(--text-secondary)', border: '1px solid var(--border-base)' }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copié' : 'Copier'}
          </button>
        ) : undefined}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">

          {/* Objective input */}
          <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="explain-objective" className="block text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-dimmed)' }}>Objectif à expliquer</label>
              <span className="text-xs tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{objective.length} car.</span>
            </div>
            <textarea
              id="explain-objective"
              ref={objectiveRef}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ex : Corriger les erreurs TypeScript du module auth"
              rows={2}
              className="w-full resize-none rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-base)' }}
            />

            {!objective && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Lightbulb size={12} style={{ color: 'var(--text-dimmed)' }} aria-hidden />
                {PRESETS.map((pst) => (
                  <button
                    key={pst}
                    type="button"
                    onClick={() => { setObjective(pst); objectiveRef.current?.focus(); }}
                    className="rounded-full px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                    style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-input)'; }}
                  >
                    {pst.length > 40 ? `${pst.slice(0, 40)}…` : pst}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                <kbd className="rounded px-1 py-0.5" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)' }}>Ctrl</kbd>
                {' + '}
                <kbd className="rounded px-1 py-0.5" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)' }}>↵</kbd>
                {' pour expliquer'}
              </span>
              <button
                type="button"
                onClick={() => void explain()}
                disabled={loading || !objective.trim()}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--bg-base)' }}
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <HelpCircle size={13} />}
                {loading ? 'Analyse…' : 'Expliquer'}
              </button>
            </div>
          </section>

          {error && (
            <div className="flex items-center gap-2 rounded-md p-3 text-xs" style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {loading && !data && <SkeletonExplain reduceMotion={!!reduceMotion} />}

          <AnimatePresence mode="wait">
            {data && p && risk && (
              <motion.div
                key={objective}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
                className="flex flex-col gap-4"
              >
                {/* Success probability + risk */}
                <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
                  <div className="mb-3 flex items-center gap-4">
                    <div className="text-2xl font-bold tabular-nums" style={{ color: successColor(p.successPercent) }}>
                      {p.successPercent}<span className="text-sm" style={{ color: 'var(--text-dimmed)' }}>%</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Probabilité de réussite estimée</p>
                      <p className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        Confiance {Math.round(p.confidence * 100)}% · risque
                        <span className="flex items-center gap-0.5 font-medium" style={{ color: risk.color }}>
                          <risk.icon size={11} /> {risk.label}
                        </span>
                      </p>
                    </div>
                  </div>
                  {/* Success gauge */}
                  <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-input)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: successColor(p.successPercent) }}
                      initial={reduceMotion ? false : { width: 0 }}
                      animate={{ width: `${p.successPercent}%` }}
                      transition={{ duration: reduceMotion ? 0 : 0.5, ease: 'easeOut' }}
                    />
                  </div>
                </section>

                {/* Decision factors — the "pourquoi" */}
                <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
                  <h2 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-dimmed)' }}>
                    <Lightbulb size={12} style={{ color: 'var(--accent-primary)' }} /> Facteurs décisionnels
                    <span className="ml-auto rounded-full px-1.5 py-0.5 text-xs normal-case tracking-normal" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-dimmed)' }}>{data.factors.length}</span>
                  </h2>
                  {data.factors.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Aucun facteur distinctif — décision basée sur l'estimation standard.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {data.factors.map((f, i) => {
                        const Icon = f.tone === 'warning' ? AlertTriangle : CheckCircle2;
                        const color = toneColor(f.tone);
                        return (
                          <motion.li
                            key={i}
                            className="flex items-start gap-2 rounded-md p-1.5"
                            style={{ backgroundColor: `color-mix(in srgb, ${color} 6%, transparent)` }}
                            initial={reduceMotion ? false : { opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: reduceMotion ? 0 : 0.18, delay: reduceMotion ? 0 : i * 0.04 }}
                          >
                            <Icon size={14} style={{ color, marginTop: 1 }} />
                            <div className="min-w-0">
                              <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{f.label}</span>
                              <span className="ml-1 text-xs" style={{ color: 'var(--text-muted)' }}>— {f.detail}</span>
                            </div>
                          </motion.li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                {/* Recommended strategy */}
                {p.recommendedStrategy.length > 0 && (
                  <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
                    <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-dimmed)' }}>
                      <ListOrdered size={12} style={{ color: 'var(--accent-primary)' }} /> Stratégie recommandée{p.playbookId ? ` (${p.playbookId})` : ''}
                    </h2>
                    <ol className="relative flex flex-col gap-0.5">
                      {p.recommendedStrategy.map((step, i) => (
                        <li key={i} className="relative flex items-center gap-2.5 pl-7 pb-2 last:pb-0">
                          {i < p.recommendedStrategy.length - 1 && (
                            <span aria-hidden className="absolute left-[11px] top-6 h-full w-px" style={{ backgroundColor: 'var(--border-base)' }} />
                          )}
                          <span className="absolute left-0 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--accent-primary)', border: '1px solid var(--border-base)' }}>{i + 1}</span>
                          <code className="text-xs" style={{ color: 'var(--text-secondary)' }}>{step}</code>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}

                {/* Weakest step */}
                {p.weakestStep && (
                  <div className="flex items-start gap-2 rounded-md px-3 py-2 text-xs" style={{ backgroundColor: 'var(--color-warning-subtle)', color: 'var(--color-warning)' }}>
                    <Target size={14} className="mt-0.5 flex-shrink-0" />
                    <span>Étape la plus fragile : <code>{p.weakestStep.skillName}</code> ({Math.round(p.weakestStep.failureRisk * 100)}% de risque) — à adapter avant exécution.</span>
                  </div>
                )}

                {/* Risks */}
                {p.risks.length > 0 && (
                  <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
                    <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--color-warning)' }}>
                      <AlertTriangle size={12} /> Risques identifiés
                      <span className="ml-auto rounded-full px-1.5 py-0.5 text-xs normal-case tracking-normal" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-dimmed)' }}>{p.risks.length}</span>
                    </h2>
                    <ul className="flex flex-col gap-1">
                      {p.risks.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full" style={{ backgroundColor: 'var(--color-warning)' }} aria-hidden />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1 text-xs italic" style={{ color: 'var(--text-dimmed)' }}>
                    <Gauge size={11} /> Facteurs décisionnels exploitables — pas le raisonnement interne du modèle.
                  </p>
                  <button
                    type="button"
                    onClick={() => void explain()}
                    disabled={loading}
                    className="flex flex-shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-50"
                    style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}
                  >
                    <RotateCcw size={13} /> Réanalyser
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function SkeletonExplain({ reduceMotion }: { reduceMotion: boolean }) {
  const pulse = reduceMotion ? '' : 'animate-pulse';
  return (
    <div className="flex flex-col gap-4">
      <div className={`h-20 rounded-lg ${pulse}`} style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }} />
      <div className={`h-28 rounded-lg ${pulse}`} style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }} />
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Analyse des facteurs décisionnels…</p>
    </div>
  );
}
