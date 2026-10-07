import { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Activity, HeartPulse, Sparkles, RefreshCw, AlertTriangle,
  Lightbulb, Wrench, ShieldAlert, Zap, Loader2, Stethoscope, Sun, X, CheckCircle2,
  Play, Workflow,
} from 'lucide-react';
import { ViewHeader } from '../components/ui/ViewHeader.js';
import { useAutonomyTimeline, type AnticipationProposal } from '../hooks/useAutonomyTimeline.js';

// ─── Types mirrored from the server insights engines ─────────────────────────

type HealthDimension = 'architecture' | 'security' | 'tests' | 'performance' | 'technicalDebt' | 'maintainability' | 'autonomy';
interface HealthReport {
  scores: Record<HealthDimension, number>;
  global: number;
  issues: Array<{ dimension: string; severity: string; message: string }>;
  improvementMissions: Array<{ title: string; priority: string }>;
}
interface Opportunity {
  id: string;
  kind: 'automation' | 'optimization' | 'prevention' | 'reliability' | 'health';
  message: string;
  suggestedAction: string;
  value: number;
  payoff: number;
}
interface BriefingReport {
  greeting: string;
  projectName: string;
  healthScore: number;
  counts: { critical: number; pending: number; improvement: number };
  highlights: string[];
}
interface DiagnoseResult { created: Array<{ missionId: string; title: string }>; failed: Array<{ title: string; error: string }>; proposed: number }

const DIMENSION_LABELS: Record<HealthDimension, string> = {
  architecture: 'Architecture',
  security: 'Sécurité',
  tests: 'Tests',
  performance: 'Performance',
  technicalDebt: 'Dette technique',
  maintainability: 'Maintenabilité',
  autonomy: 'Autonomie',
};

/** Score → semantic token. */
function scoreColor(n: number): string {
  if (n >= 85) return 'var(--color-success)';
  if (n >= 70) return 'var(--color-info)';
  if (n >= 50) return 'var(--color-warning)';
  return 'var(--color-error)';
}

export default function MissionControlView() {
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const { state, proposals, connection } = useAutonomyTimeline({ enabled: true });
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [briefing, setBriefing] = useState<BriefingReport | null>(null);
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseResult, setDiagnoseResult] = useState<DiagnoseResult | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [doctorRes, oppRes, briefRes] = await Promise.all([
        fetch('/api/knowledge/doctor').then((r) => r.json()).catch(() => null),
        fetch('/api/knowledge/opportunities?limit=8').then((r) => r.json()).catch(() => null),
        fetch('/api/knowledge/daily-briefing').then((r) => r.json()).catch(() => null),
      ]);
      if (doctorRes?.report) setHealth(doctorRes.report as HealthReport);
      if (oppRes?.report?.opportunities) setOpportunities(oppRes.report.opportunities as Opportunity[]);
      if (briefRes?.report) setBriefing(briefRes.report as BriefingReport);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  /** « Diagnostiquer » : matérialise les missions d'amélioration du Doctor. */
  const diagnose = useCallback(async () => {
    setDiagnosing(true);
    setDiagnoseResult(null);
    try {
      const res = await fetch('/api/missions/doctor/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max: 5 }),
      });
      const data = await res.json();
      if (res.ok && !data?.error) setDiagnoseResult(data as DiagnoseResult);
    } finally {
      setDiagnosing(false);
    }
  }, []);

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      <ViewHeader
        title="Mission Control"
        icon={LayoutDashboard}
        description="Ce que Leanna sait, fait, a découvert et propose — en un seul tableau de bord"
        badge={connection === 'open' ? 'En direct' : 'Hors ligne'}
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-60"
            style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)' }}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Actualiser
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">

          {/* Daily briefing — « point du jour » affiché au chargement */}
          {briefing && !briefingDismissed && (
            <DailyBriefingBanner briefing={briefing} reduceMotion={!!reduceMotion} onDismiss={() => setBriefingDismissed(true)} />
          )}

          {/* Row 1 — Agent state + health global */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <AgentStateCard status={state?.status} health={state?.health} activeTasks={state?.activeTasks} />
            <HealthGlobalCard report={health} loading={loading} />
          </div>

          {/* Row 2 — Health dimensions */}
          <HealthDimensionsCard report={health} reduceMotion={!!reduceMotion} />

          {/* Row 3 — Insights (anticipation) + Opportunities */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <InsightsCard proposals={proposals} onLaunched={() => navigate('/mission-timeline')} />
            <OpportunitiesCard opportunities={opportunities} />
          </div>

          {/* Row 4 — Improvement plan + Diagnostiquer */}
          {health?.improvementMissions && health.improvementMissions.length > 0 && (
            <ImprovementPlanCard
              missions={health.improvementMissions}
              diagnosing={diagnosing}
              result={diagnoseResult}
              onDiagnose={() => void diagnose()}
              onOpenTimeline={() => navigate('/mission-timeline')}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DailyBriefingBanner({ briefing, reduceMotion, onDismiss }: { briefing: BriefingReport; reduceMotion: boolean; onDismiss: () => void }) {
  const { counts } = briefing;
  const chip = (n: number, color: string, label: string) => (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden /> {n} {label}
    </span>
  );
  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
      className="relative rounded-lg border p-4 shadow-sm"
      style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Masquer le point du jour"
        className="absolute right-2 top-2 rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
        style={{ color: 'var(--text-dimmed)' }}
      >
        <X size={13} />
      </button>
      <div className="mb-2 flex items-center gap-2">
        <Sun size={15} style={{ color: 'var(--accent-secondary)' }} />
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{briefing.greeting}</h2>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {chip(counts.critical, 'var(--color-error)', 'critique(s)')}
        {chip(counts.pending, 'var(--color-warning)', 'en attente')}
        {chip(counts.improvement, 'var(--color-success)', 'amélioration(s)')}
      </div>
      {briefing.highlights.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          {briefing.highlights.map((h, i) => <li key={i}>• {h}</li>)}
        </ul>
      )}
    </motion.section>
  );
}

// ─── Per-item action helper (idle → loading → done/error) ───────────────────

type ActionStatus = 'idle' | 'loading' | 'done' | 'error';

function useItemActions() {
  const [statuses, setStatuses] = useState<Record<string, ActionStatus>>({});
  const run = useCallback(async (key: string, fn: () => Promise<boolean>) => {
    setStatuses((s) => ({ ...s, [key]: 'loading' }));
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    setStatuses((s) => ({ ...s, [key]: ok ? 'done' : 'error' }));
  }, []);
  return { statuses, run };
}

/** Small inline action button that reflects an ActionStatus. */
function ActionButton({ status, idleLabel, doneLabel, icon: Icon, onClick }: {
  status: ActionStatus;
  idleLabel: string;
  doneLabel: string;
  icon: React.FC<{ size?: number; className?: string }>;
  onClick: () => void;
}) {
  const done = status === 'done';
  const error = status === 'error';
  const color = done ? 'var(--color-success)' : error ? 'var(--color-error)' : 'var(--accent-secondary)';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={status === 'loading' || done}
      className="ml-auto flex flex-shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-70"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color, border: `1px solid color-mix(in srgb, ${color} 25%, transparent)` }}
    >
      {status === 'loading' ? <Loader2 size={11} className="animate-spin" /> : <Icon size={11} />}
      {done ? doneLabel : error ? 'Réessayer' : idleLabel}
    </button>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────────

function Card({ icon: Icon, title, action, children }: {
  icon: React.FC<{ size?: number; style?: React.CSSProperties }>;
  title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={14} style={{ color: 'var(--accent-primary)' }} />
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function AgentStateCard({ status, health, activeTasks }: { status?: string; health?: string; activeTasks?: number }) {
  const label = status ?? 'inconnu';
  const dotColor = health === 'degraded' ? 'var(--color-warning)' : status === 'executing' ? 'var(--accent-secondary)' : 'var(--color-success)';
  return (
    <Card icon={Activity} title="État de l'agent">
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
        <div className="min-w-0">
          <p className="text-base font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>{label}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {typeof activeTasks === 'number' ? `${activeTasks} tâche(s) active(s)` : 'Autonomie en veille'}
            {health ? ` · santé ${health === 'healthy' ? 'saine' : 'dégradée'}` : ''}
          </p>
        </div>
      </div>
    </Card>
  );
}

function HealthGlobalCard({ report, loading }: { report: HealthReport | null; loading: boolean }) {
  return (
    <Card icon={HeartPulse} title="Santé globale du projet">
      {loading && !report ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Analyse en cours…</p>
      ) : report ? (
        <div className="flex items-center gap-4">
          <div className="text-2xl font-bold" style={{ color: scoreColor(report.global) }}>{report.global}<span className="text-sm" style={{ color: 'var(--text-dimmed)' }}>/100</span></div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {report.issues.length} problème(s) détecté(s){report.improvementMissions.length ? ` · ${report.improvementMissions.length} mission(s) proposée(s)` : ''}
          </p>
        </div>
      ) : (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Diagnostic indisponible — connecte un projet indexé.</p>
      )}
    </Card>
  );
}

function HealthDimensionsCard({ report, reduceMotion }: { report: HealthReport | null; reduceMotion: boolean }) {
  const dims = Object.keys(DIMENSION_LABELS) as HealthDimension[];
  return (
    <Card icon={HeartPulse} title="Dimensions de santé">
      {report ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {dims.map((dim) => {
            const score = report.scores[dim] ?? 0;
            return (
              <div key={dim}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{DIMENSION_LABELS[dim]}</span>
                  <span className="text-xs font-semibold" style={{ color: scoreColor(score) }}>{score}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-input)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: scoreColor(score) }}
                    initial={reduceMotion ? false : { width: 0 }}
                    animate={{ width: `${score}%` }}
                    transition={{ duration: reduceMotion ? 0 : 0.5, ease: 'easeOut' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Lance une analyse pour afficher les scores par dimension.</p>
      )}
    </Card>
  );
}

const PROPOSAL_ICON: Record<AnticipationProposal['kind'], React.FC<{ size?: number; style?: React.CSSProperties }>> = {
  problem: AlertTriangle, risk: ShieldAlert, opportunity: Lightbulb, optimization: Zap, automation: Wrench,
};

function InsightsCard({ proposals, onLaunched }: { proposals: AnticipationProposal[]; onLaunched: () => void }) {
  const { statuses, run } = useItemActions();
  const launch = (p: AnticipationProposal) => run(p.proposalId, async () => {
    const res = await fetch('/api/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: p.suggestedAction, description: p.message }),
    });
    const data = await res.json().catch(() => null);
    const ok = res.ok && data && !data.error;
    if (ok) setTimeout(onLaunched, 600);
    return ok;
  });
  return (
    <Card icon={Sparkles} title="Insights (Anticipation)">
      {proposals.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Rien de notable détecté pour le moment. Leanna observe en continu.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {proposals.slice(0, 6).map((p) => {
            const Icon = PROPOSAL_ICON[p.kind] ?? Lightbulb;
            const color = p.priority === 'critical' ? 'var(--color-error)' : p.priority === 'high' ? 'var(--color-warning)' : 'var(--color-info)';
            return (
              <li key={p.proposalId} className="flex items-start gap-2 rounded-md p-2" style={{ backgroundColor: 'var(--bg-input)' }}>
                <Icon size={14} style={{ color, marginTop: 2 }} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{p.message}</p>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>→ {p.suggestedAction}</p>
                </div>
                <ActionButton
                  status={statuses[p.proposalId] ?? 'idle'}
                  idleLabel="Lancer"
                  doneLabel="Lancée"
                  icon={Play}
                  onClick={() => void launch(p)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const OPP_ICON: Record<Opportunity['kind'], React.FC<{ size?: number; style?: React.CSSProperties }>> = {
  automation: Wrench, optimization: Zap, prevention: ShieldAlert, reliability: Activity, health: HeartPulse,
};

function OpportunitiesCard({ opportunities }: { opportunities: Opportunity[] }) {
  const { statuses, run } = useItemActions();
  const automate = (o: Opportunity) => run(o.id, async () => {
    const res = await fetch('/api/knowledge/automate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: `${o.suggestedAction}. ${o.message}`, name: o.suggestedAction }),
    });
    const data = await res.json().catch(() => null);
    return res.ok && data && !data.error && !!data.workflowId;
  });
  return (
    <Card icon={Lightbulb} title="Opportunités">
      {opportunities.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Aucune opportunité détectée. Leanna cherche du travail utile en arrière-plan.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {opportunities.slice(0, 6).map((o) => {
            const Icon = OPP_ICON[o.kind] ?? Lightbulb;
            return (
              <li key={o.id} className="flex items-start gap-2 rounded-md p-2" style={{ backgroundColor: 'var(--bg-input)' }}>
                <Icon size={14} style={{ color: 'var(--accent-secondary)', marginTop: 2 }} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{o.suggestedAction}</p>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>{o.message}</p>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full px-1.5 py-0.5 text-xs font-medium" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-secondary)' }}>
                    {Math.round(o.payoff)}
                  </span>
                  <ActionButton
                    status={statuses[o.id] ?? 'idle'}
                    idleLabel="Automatiser"
                    doneLabel="Workflow créé"
                    icon={Workflow}
                    onClick={() => void automate(o)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ImprovementPlanCard({ missions, diagnosing, result, onDiagnose, onOpenTimeline }: {
  missions: Array<{ title: string; priority: string }>;
  diagnosing: boolean;
  result: DiagnoseResult | null;
  onDiagnose: () => void;
  onOpenTimeline: () => void;
}) {
  const priorityColor = (p: string) => p === 'critical' ? 'var(--color-error)' : p === 'high' ? 'var(--color-warning)' : 'var(--color-info)';
  return (
    <Card
      icon={Wrench}
      title="Plan d'amélioration proposé"
      action={
        result ? (
          <button
            type="button"
            onClick={onOpenTimeline}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            style={{ backgroundColor: 'var(--bg-input)', color: 'var(--color-success)', border: '1px solid var(--border-base)' }}
          >
            <CheckCircle2 size={12} /> {result.created.length} mission(s) créée(s) · voir
          </button>
        ) : (
          <button
            type="button"
            onClick={onDiagnose}
            disabled={diagnosing}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:opacity-60"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--bg-base)' }}
            title="Créer les missions d'amélioration proposées"
          >
            {diagnosing ? <Loader2 size={12} className="animate-spin" /> : <Stethoscope size={12} />}
            Diagnostiquer & créer
          </button>
        )
      }
    >
      <ol className="flex flex-col gap-1.5">
        {missions.slice(0, 8).map((m, i) => (
          <li key={i} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-xs font-semibold" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}>{i + 1}</span>
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: priorityColor(m.priority) }} aria-hidden />
            <span className="truncate">{m.title}</span>
          </li>
        ))}
      </ol>
      {result && result.failed.length > 0 && (
        <p className="mt-2 text-xs" style={{ color: 'var(--color-warning)' }}>
          {result.failed.length} mission(s) non créée(s) (voir les logs serveur).
        </p>
      )}
    </Card>
  );
}
