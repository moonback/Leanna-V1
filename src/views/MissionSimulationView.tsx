import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  FlaskConical, Loader2, Play, Pencil, X, FileEdit, TerminalSquare, Users,
  Wrench, Clock, DollarSign, AlertTriangle, ShieldCheck, ShieldAlert,
  Sparkles, Copy, Check, ShieldOff, Lightbulb, RotateCcw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ViewHeader } from '../components/ui/ViewHeader.js';

// ─── Types mirrored from the MissionSimulator engine (mission_simulate) ──────

interface SimulatedStep { order: number; skillName: string; goalTitle: string }
interface SimulationReport {
  missionId: string;
  steps: SimulatedStep[];
  filesWouldChange: string[];
  commandsWouldRun: string[];
  agentsInvolved: string[];
  toolCalls: number;
  sideEffectsAvoided: number;
  estimatedDurationMs: number;
  estimatedCostUsd: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  risks: string[];
  planComplete: boolean;
  summary: string;
}

type RiskLevel = SimulationReport['riskLevel'];

const RISK_META: Record<RiskLevel, { color: string; label: string; score: number; icon: React.FC<{ size?: number; style?: React.CSSProperties }> }> = {
  low:      { color: 'var(--color-success)', label: 'Faible',   score: 25,  icon: ShieldCheck },
  medium:   { color: 'var(--color-info)',    label: 'Modéré',   score: 50,  icon: ShieldAlert },
  high:     { color: 'var(--color-warning)', label: 'Élevé',    score: 78,  icon: ShieldAlert },
  critical: { color: 'var(--color-error)',   label: 'Critique', score: 100, icon: ShieldOff },
};

/** Exemples d'objectifs pour amorcer la simulation. */
const PRESETS: string[] = [
  'Corrige les erreurs TypeScript et vérifie que les tests passent',
  'Ajoute la pagination à l\'endpoint /users',
  'Mets à jour les dépendances et lance le build',
  'Refactorise le module d\'authentification',
];

function formatDuration(ms: number): string {
  if (ms <= 0) return 'n/a';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

export default function MissionSimulationView() {
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const [objective, setObjective] = useState('');
  const [description, setDescription] = useState('');
  const [report, setReport] = useState<SimulationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmExec, setConfirmExec] = useState(false);
  const objectiveRef = useRef<HTMLTextAreaElement>(null);

  const simulate = useCallback(async () => {
    if (!objective.trim()) return;
    setLoading(true); setError(null); setReport(null); setConfirmExec(false);
    try {
      const res = await fetch('/api/missions/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: objective.trim(), description: description.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) { setError(data?.error ?? 'Échec de la simulation.'); return; }
      setReport(data as SimulationReport);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [objective, description]);

  const execute = useCallback(async () => {
    if (!objective.trim()) return;
    setRunning(true); setError(null);
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: objective.trim(), description: description.trim() || objective.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) { setError(data?.error ?? 'Échec du lancement.'); return; }
      navigate('/mission-timeline');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [objective, description, navigate]);

  const cancel = useCallback(() => { setReport(null); setError(null); setConfirmExec(false); }, []);

  const copyReport = useCallback(async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }, [report]);

  // Ctrl/Cmd+Enter lance la simulation depuis le champ objectif.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void simulate(); }
  }, [simulate]);

  // Si le risque est élevé/critique, l'exécution réelle demande une confirmation.
  const risky = report ? (report.riskLevel === 'high' || report.riskLevel === 'critical') : false;

  const onExecuteClick = useCallback(() => {
    if (risky && !confirmExec) { setConfirmExec(true); return; }
    void execute();
  }, [risky, confirmExec, execute]);

  // Reset de la confirmation si l'utilisateur relance une simulation.
  useEffect(() => { setConfirmExec(false); }, [report]);

  const risk = report ? RISK_META[report.riskLevel] : null;

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      <ViewHeader
        title="Simulation de mission"
        icon={FlaskConical}
        description="Prévisualise ce que Leanna ferait — fichiers, commandes, agents, coût, risque — avant d'exécuter réellement"
        badge="Dry-run"
        actions={report ? (
          <button
            type="button"
            onClick={copyReport}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            style={{ backgroundColor: 'var(--bg-input)', color: copied ? 'var(--color-success)' : 'var(--text-secondary)', border: '1px solid var(--border-base)' }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copié' : 'Copier le rapport'}
          </button>
        ) : undefined}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">

          {/* Objective input */}
          <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="sim-objective" className="block text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-dimmed)' }}>Objectif</label>
              <span className="text-xs tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{objective.length} car.</span>
            </div>
            <textarea
              id="sim-objective"
              ref={objectiveRef}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ex : Corrige les erreurs TypeScript et vérifie que les tests passent"
              rows={2}
              className="w-full resize-none rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-base)' }}
            />

            {/* Description optionnelle */}
            <label htmlFor="sim-desc" className="mb-1.5 mt-3 block text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-dimmed)' }}>
              Contexte <span className="font-normal normal-case" style={{ color: 'var(--text-dimmed)' }}>(optionnel)</span>
            </label>
            <textarea
              id="sim-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Détails, contraintes, fichiers concernés…"
              rows={2}
              className="w-full resize-none rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-base)' }}
            />

            {/* Presets */}
            {!objective && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Lightbulb size={12} style={{ color: 'var(--text-dimmed)' }} aria-hidden />
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setObjective(p); objectiveRef.current?.focus(); }}
                    className="rounded-full px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                    style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-input)'; }}
                  >
                    {p.length > 40 ? `${p.slice(0, 40)}…` : p}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                <kbd className="rounded px-1 py-0.5" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)' }}>Ctrl</kbd>
                {' + '}
                <kbd className="rounded px-1 py-0.5" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)' }}>↵</kbd>
                {' pour simuler'}
              </span>
              <button
                type="button"
                onClick={() => void simulate()}
                disabled={loading || !objective.trim()}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--bg-base)' }}
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
                {loading ? 'Simulation…' : 'Simuler'}
              </button>
            </div>
          </section>

          {error && (
            <div className="flex items-center gap-2 rounded-md p-3 text-xs" style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {loading && !report && <SkeletonReport reduceMotion={!!reduceMotion} />}

          <AnimatePresence mode="wait">
            {report && risk && (
              <motion.div
                key={report.missionId}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
                className="flex flex-col gap-4"
              >
                {/* Summary */}
                {report.summary && (
                  <div className="flex items-start gap-2 rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--accent-subtle)', color: 'var(--text-secondary)' }}>
                    <Sparkles size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-secondary)' }} />
                    <p>{report.summary}</p>
                  </div>
                )}

                {/* Risk gauge */}
                <RiskGauge level={report.riskLevel} planComplete={report.planComplete} />

                {/* Metrics grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Metric icon={FileEdit} label="Fichiers modifiés" value={report.filesWouldChange.length} tone="var(--accent-primary)" />
                  <Metric icon={TerminalSquare} label="Commandes" value={report.commandsWouldRun.length} tone="var(--accent-secondary)" />
                  <Metric icon={Users} label="Agents" value={report.agentsInvolved.length} tone="var(--color-info)" />
                  <Metric icon={Wrench} label="Appels d'outils" value={report.toolCalls} tone="var(--accent-primary)" />
                  <Metric icon={Clock} label="Durée est." value={formatDuration(report.estimatedDurationMs)} tone="var(--color-info)" />
                  <Metric icon={DollarSign} label="Coût est." value={`$${report.estimatedCostUsd.toFixed(2)}`} tone="var(--color-success)" />
                </div>

                {report.sideEffectsAvoided > 0 && (
                  <div className="flex items-center gap-2 rounded-md px-3 py-2 text-xs" style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 10%, transparent)', color: 'var(--color-success)' }}>
                    <ShieldCheck size={14} />
                    {report.sideEffectsAvoided} effet{report.sideEffectsAvoided > 1 ? 's' : ''} de bord évité{report.sideEffectsAvoided > 1 ? 's' : ''} grâce au dry-run
                  </div>
                )}

                {report.risks.length > 0 && (
                  <ListCard title="Risques détectés" items={report.risks} tone="var(--color-warning)" />
                )}
                {report.agentsInvolved.length > 0 && (
                  <ListCard title="Agents impliqués" items={report.agentsInvolved} />
                )}
                {report.filesWouldChange.length > 0 && (
                  <ListCard title="Fichiers qui seraient modifiés" items={report.filesWouldChange} mono />
                )}
                {report.commandsWouldRun.length > 0 && (
                  <ListCard title="Commandes qui seraient exécutées" items={report.commandsWouldRun} mono />
                )}

                {/* Plan steps timeline */}
                {report.steps.length > 0 && (
                  <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-dimmed)' }}>Plan ({report.steps.length} étapes)</h2>
                    <ol className="relative flex flex-col gap-0.5">
                      {report.steps.map((s, i) => (
                        <li key={s.order} className="relative flex items-center gap-2.5 pl-7 pb-2 last:pb-0">
                          {i < report.steps.length - 1 && (
                            <span aria-hidden className="absolute left-[11px] top-6 h-full w-px" style={{ backgroundColor: 'var(--border-base)' }} />
                          )}
                          <span className="absolute left-0 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--accent-primary)', border: '1px solid var(--border-base)' }}>{s.order + 1}</span>
                          <code className="flex-shrink-0 text-xs" style={{ color: 'var(--text-primary)' }}>{s.skillName}</code>
                          <span className="truncate text-xs" style={{ color: 'var(--text-dimmed)' }}>· {s.goalTitle}</span>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}

                {/* Risky execution confirmation */}
                {confirmExec && risky && (
                  <div className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium" style={{ backgroundColor: `color-mix(in srgb, ${risk.color} 12%, transparent)`, color: risk.color, border: `1px solid color-mix(in srgb, ${risk.color} 30%, transparent)` }}>
                    <AlertTriangle size={14} />
                    Risque {risk.label.toLowerCase()} — clique à nouveau sur « Exécuter réellement » pour confirmer.
                  </div>
                )}

                {/* Action buttons */}
                <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-lg py-1">
                  <button type="button" onClick={cancel}
                    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                    style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}>
                    <X size={13} /> Annuler
                  </button>
                  <button type="button" onClick={() => void simulate()} disabled={loading}
                    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-50"
                    style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}>
                    <RotateCcw size={13} /> Re-simuler
                  </button>
                  <button type="button" onClick={() => { setReport(null); objectiveRef.current?.focus(); }}
                    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                    style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}>
                    <Pencil size={13} /> Modifier le plan
                  </button>
                  <button type="button" onClick={onExecuteClick} disabled={running}
                    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-50"
                    style={{ backgroundColor: confirmExec && risky ? risk.color : 'var(--color-success)', color: 'var(--bg-base)' }}>
                    {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                    {confirmExec && risky ? 'Confirmer l\'exécution' : 'Exécuter réellement'}
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

// ─── Sub-components ──────────────────────────────────────────────────────────

function RiskGauge({ level, planComplete }: { level: RiskLevel; planComplete: boolean }) {
  const meta = RISK_META[level];
  const Icon = meta.icon;
  return (
    <div className="rounded-lg border p-3 shadow-sm" style={{ borderColor: `color-mix(in srgb, ${meta.color} 30%, transparent)`, backgroundColor: `color-mix(in srgb, ${meta.color} 8%, transparent)` }}>
      <div className="mb-2 flex items-center gap-2">
        <Icon size={16} style={{ color: meta.color }} />
        <span className="text-sm font-semibold" style={{ color: meta.color }}>Risque {meta.label.toLowerCase()}</span>
        {!planComplete && (
          <span className="ml-auto rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}>plan incomplet</span>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-input)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${meta.score}%`, backgroundColor: meta.color }} />
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }: {
  icon: React.FC<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div className="rounded-lg border p-3 shadow-sm transition-colors" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded" style={{ backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)` }}>
          <Icon size={11} style={{ color: tone }} />
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <p className="text-base font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}</p>
    </div>
  );
}

function ListCard({ title, items, mono, tone }: { title: string; items: string[]; mono?: boolean; tone?: string }) {
  return (
    <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: tone ?? 'var(--text-dimmed)' }}>
        {tone && <AlertTriangle size={12} />}
        {title}
        <span className="ml-auto rounded-full px-1.5 py-0.5 text-xs normal-case tracking-normal" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-dimmed)' }}>{items.length}</span>
      </h2>
      <ul className="flex flex-col gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full" style={{ backgroundColor: tone ?? 'var(--text-dimmed)' }} aria-hidden />
            {mono ? <code className="break-all">{it}</code> : <span>{it}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SkeletonReport({ reduceMotion }: { reduceMotion: boolean }) {
  const pulse = reduceMotion ? '' : 'animate-pulse';
  return (
    <div className="flex flex-col gap-4">
      <div className={`h-16 rounded-lg ${pulse}`} style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`h-16 rounded-lg ${pulse}`} style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-base)' }} />
        ))}
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Simulation en cours (dry-run, aucun effet de bord)…</p>
    </div>
  );
}
