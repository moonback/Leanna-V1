import { useEffect, useId, useRef, useState, useCallback } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  FileCode,
  Layers,
  Database,
  GitBranch,
  GitFork,
  Zap,
  Folder,
  HardDrive,
  Circle,
} from 'lucide-react';
import { useToast } from '../ui/Toast.js';
import { ASTCallGraphExplorer } from './ASTCallGraphExplorer.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HealthData {
  status: string;
  timestamp: string;
  health: {
    overall: 'healthy' | 'warning' | 'degraded';
    isInitialized: boolean;
    lastIndexed?: string;
    warnings: string[];
  };
  knowledgeGraph: {
    totalFiles: number;
    totalEntities: number;
    totalLines: number;
    totalExports: number;
    totalImports: number;
    averageFileSize: number;
  };
  dependencyGraph: {
    cycleCount: number;
    cycles: string[][];
  };
  projectMemory: {
    totalFacts: number;
    structuralFacts: number;
    categoryBreakdown: Record<string, number>;
    maxFacts: number;
  };
  workspace: {
    selfRoot: string;
    activeWorkspace: string;
    sandboxActive: boolean;
  };
}

interface DocumentsData {
  extractor: { extracted: number; watching: boolean };
  documentCount: number;
  documents: {
    id: string;
    fileName: string;
    mimeType: string;
    summary: string;
    keywords: string[];
    tags: string[];
    uploadedAt: string;
    textLength: number;
  }[];
}

interface ReindexProgress {
  phase: 'incremental' | 'parse' | 'ast' | 'relations' | 'done';
  current: number;
  total: number;
  file?: string;
}

const PHASE_LABELS: Record<ReindexProgress['phase'], string> = {
  incremental: 'Mise à jour incrémentale',
  parse:       'Analyse des fichiers',
  ast:         'Construction AST',
  relations:   'Extraction des relations',
  done:        'Terminé',
};

type TabId = 'overview' | 'ast' | 'memory' | 'documents' | 'dependencies';

// ── Component ─────────────────────────────────────────────────────────────────

export function KnowledgeHealthDashboard() {
  const { success, error: toastError } = useToast();
  const [data, setData]               = useState<HealthData | null>(null);
  const [docsData, setDocsData]       = useState<DocumentsData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [reindexing, setReindexing]   = useState(false);
  const [reextracting, setReextracting] = useState(false);
  const [activeTab, setActiveTab]     = useState<TabId>('overview');
  /** Progression temps-réel via WebSocket knowledge_progress */
  const [reindexProgress, setReindexProgress] = useState<ReindexProgress | null>(null);

  const tablistId  = useId();
  const progressId = useId();
  // Store abort controller for reindex fetch
  const reindexAbortRef = useRef<AbortController | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const [healthRes, docsRes] = await Promise.all([
        fetch('/api/knowledge/health'),
        fetch('/api/knowledge/documents'),
      ]);
      if (!healthRes.ok) throw new Error('Erreur HTTP ' + healthRes.status);
      const json = await healthRes.json();
      if (json.status === 'success') {
        setData(json);
      } else {
        throw new Error(json.error || 'Statut invalide');
      }
      if (docsRes.ok) {
        const docsJson = await docsRes.json();
        if (docsJson.status === 'success') setDocsData(docsJson);
      }
    } catch {
      toastError('Impossible de charger le statut du Knowledge System');
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  // ── WebSocket progress listener ────────────────────────────────────────────
  // S'abonne aux events 'Leanna-knowledge-progress' diffusés par useLiveAPI
  // quand le serveur envoie broadcastKnowledgeProgress().
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail as ReindexProgress & { type: string };
      if (msg.type !== 'knowledge_progress') return;
      setReindexProgress({ phase: msg.phase, current: msg.current, total: msg.total, file: msg.file });
      if (msg.phase === 'done') {
        // Petit délai pour que l'animation de fin soit visible
        setTimeout(() => {
          setReindexProgress(null);
          fetchHealth();
        }, 800);
      }
    };
    window.addEventListener('Leanna-knowledge-progress', handler);
    return () => window.removeEventListener('Leanna-knowledge-progress', handler);
  }, [fetchHealth]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleReindex = async () => {
    if (reindexing) {
      reindexAbortRef.current?.abort();
      return;
    }
    reindexAbortRef.current = new AbortController();
    setReindexing(true);
    setReindexProgress({ phase: 'parse', current: 0, total: 0 });
    try {
      const res = await fetch('/api/knowledge/reindex', {
        method: 'POST',
        signal: reindexAbortRef.current.signal,
      });
      if (!res.ok) throw new Error('Échec réindexation');
      const json = await res.json();
      success(
        `Projet réindexé : ${json.stats?.totalFiles ?? 0} fichiers en ${((json.stats?.durationMs ?? 0) / 1000).toFixed(1)}s`
      );
      await fetchHealth();
    } catch (err: any) {
      if (err.name !== 'AbortError') toastError('Erreur lors de la réindexation du projet');
    } finally {
      setReindexing(false);
      reindexAbortRef.current = null;
      // La progression sera remise à null par l'event 'done' ou immédiatement
      // si le broadcast ne vient pas (ex. connexion WebSocket absente).
      setReindexProgress(null);
    }
  };

  const handleReextract = async () => {
    setReextracting(true);
    try {
      const res = await fetch('/api/knowledge/documents/reextract', { method: 'POST' });
      if (!res.ok) throw new Error('Échec ré-extraction');
      const json = await res.json();
      success(
        `Documents ré-extraits : ${json.stats?.totalExtracted ?? 0} documents, ${json.stats?.totalWords ?? 0} mots`
      );
      await fetchHealth();
    } catch {
      toastError('Erreur lors de la ré-extraction des documents');
    } finally {
      setReextracting(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => () => { reindexAbortRef.current?.abort(); }, []);

  // ── Derived ────────────────────────────────────────────────────────────────

  const progressPct = reindexProgress && reindexProgress.total > 0
    ? Math.round((reindexProgress.current / reindexProgress.total) * 100)
    : reindexProgress ? 100 : 0; // phase sans total connu → barre indéterminée

  // ── Render helpers ─────────────────────────────────────────────────────────

  const getStatusBadge = () => {
    const overall = data?.health.overall ?? 'degraded';
    if (overall === 'healthy') return (
      <div
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
        role="status"
        aria-label="État du système : optimal"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
        Système Optimal
      </div>
    );
    if (overall === 'warning') return (
      <div
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"
        role="status"
        aria-label="État du système : avertissements détectés"
      >
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
        <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
        Avertissements Détectés
      </div>
    );
    return (
      <div
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20"
        role="status"
        aria-label="État du système : dégradé"
      >
        <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" aria-hidden="true" />
        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
        Système Dégradé
      </div>
    );
  };

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading && !data) return (
    <div
      className="flex flex-col items-center justify-center p-12 gap-3"
      role="status"
      aria-label="Chargement en cours"
      style={{ color: 'var(--text-muted)' }}
    >
      <RefreshCw className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
      <p className="text-sm font-medium">Analyse de la santé du Knowledge System...</p>
    </div>
  );

  if (!data) return (
    <div
      className="p-8 text-center rounded-2xl border"
      style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
    >
      <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-500" aria-hidden="true" />
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        Données de santé indisponibles
      </p>
      <button
        onClick={fetchHealth}
        className="mt-4 px-4 py-2 text-xs font-semibold rounded-xl transition-all"
        style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
        aria-label="Réessayer le chargement"
      >
        Réessayer
      </button>
    </div>
  );

  const { health, knowledgeGraph: kg, dependencyGraph: dg, projectMemory: pm, workspace } = data;

  const TABS: { id: TabId; label: string; ariaLabel: string; hidden?: boolean }[] = [
    { id: 'overview',      label: "Vue d\u2019Ensemble",                    ariaLabel: "Onglet Vue d\u2019ensemble" },
    { id: 'ast',           label: 'AST & Call-Graph',                  ariaLabel: 'Onglet AST et Call-Graph' },
    { id: 'memory',        label: `Project Memory (${pm.totalFacts})`, ariaLabel: `Onglet Project Memory, ${pm.totalFacts} faits` },
    { id: 'documents',     label: `Documents (${docsData?.documentCount ?? 0})`, ariaLabel: `Onglet Documents, ${docsData?.documentCount ?? 0} documents` },
    { id: 'dependencies',  label: `Cycles (${dg.cycleCount})`,         ariaLabel: `Onglet Cycles de dépendances, ${dg.cycleCount} cycle${dg.cycleCount !== 1 ? 's' : ''}`, hidden: dg.cycleCount === 0 },
  ];

  return (
    <div className="space-y-6">

      {/* ── Top Banner ─────────────────────────────────────────────────────── */}
      <div
        className="p-5 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative overflow-hidden"
        style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
      >
        <div className="space-y-1.5 z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
              Knowledge System Health Monitor
            </h2>
            {getStatusBadge()}
          </div>
          <p className="text-xs flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
            <Folder className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
            <span>
              Workspace :{' '}
              <code
                className="px-1.5 py-0.5 rounded text-xs"
                style={{ backgroundColor: 'var(--bg-base)' }}
              >
                {workspace.activeWorkspace}
              </code>
            </span>
            {workspace.sandboxActive && (
              <span
                className="px-2 py-0.5 rounded text-sm font-semibold"
                style={{ backgroundColor: 'rgba(0,194,255,0.2)', color: 'rgba(0,194,255,0.7)', border: '1px solid rgba(0,194,255,0.3)' }}
                aria-label="Mode sandbox actif"
              >
                Sandbox Actif
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 z-10">
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="p-2.5 rounded-xl border transition-colors hover:bg-[var(--bg-hover)]"
            style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
            aria-label="Rafraîchir les métriques"
            title="Rafraîchir les métriques"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>

          <button
            onClick={handleReindex}
            disabled={false}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs transition-all shadow-lg shadow-cyan-500/10 active:scale-95"
            style={{ backgroundColor: reindexing ? 'var(--bg-hover)' : 'var(--accent-primary)', color: 'white', opacity: 1 }}
            aria-label={reindexing ? 'Annuler la réindexation' : 'Lancer la réindexation complète du projet'}
            aria-busy={reindexing}
            aria-describedby={reindexing ? progressId : undefined}
          >
            <Zap className={`w-3.5 h-3.5 ${reindexing ? 'animate-bounce' : ''}`} aria-hidden="true" />
            {reindexing ? 'Annuler' : 'Réindexer le projet'}
          </button>
        </div>
      </div>

      {/* ── Barre de progression réindexation ──────────────────────────────── */}
      {reindexProgress && (
        <div
          id={progressId}
          className="space-y-2 p-4 rounded-2xl border"
          style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
          role="region"
          aria-label="Progression de la réindexation"
        >
          {/* Live region annoncée aux screen readers à chaque update */}
          <div
            aria-live="polite"
            aria-atomic="true"
            className="flex items-center justify-between text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {PHASE_LABELS[reindexProgress.phase]}
            </span>
            <span>
              {reindexProgress.total > 0
                ? `${reindexProgress.current} / ${reindexProgress.total} fichiers`
                : reindexProgress.phase === 'done' ? 'Terminé' : 'En cours…'}
            </span>
          </div>

          {/* Barre visuelle */}
          <div
            className="h-2 w-full rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--bg-hover)' }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
            aria-label={`${progressPct}% — ${PHASE_LABELS[reindexProgress.phase]}`}
          >
            <div
              className="h-full rounded-full transition-all bg-gradient-to-r from-cyan-500 to-blue-500"
              style={{
                width: reindexProgress.total > 0 ? `${progressPct}%` : '100%',
                animation: reindexProgress.total === 0 ? 'pulse 1.5s ease-in-out infinite' : undefined,
              }}
            />
          </div>

          {reindexProgress.file && (
            <p
              className="text-xs truncate"
              style={{ color: 'var(--text-muted)' }}
              aria-label={`Fichier en cours : ${reindexProgress.file}`}
            >
              {reindexProgress.file}
            </p>
          )}
        </div>
      )}

      {/* ── Warnings ───────────────────────────────────────────────────────── */}
      {health.warnings.length > 0 && (
        <div
          className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2"
          role="alert"
          aria-label={`${health.warnings.length} avertissement${health.warnings.length > 1 ? 's' : ''} système`}
        >
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            <span>Diagnostiques et Avertissements Système ({health.warnings.length})</span>
          </div>
          <ul className="space-y-1 pl-6 list-disc text-xs text-amber-200/80">
            {health.warnings.map((warn, i) => <li key={i}>{warn}</li>)}
          </ul>
        </div>
      )}

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        role="list"
        aria-label="Indicateurs clés"
      >
        {/* Card 1: Codebase */}
        <article
          className="p-4 rounded-2xl border space-y-3"
          style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
          aria-label={`Codebase indexé : ${kg.totalFiles} fichiers, ${kg.totalEntities} entités`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Codebase Indexé
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400" aria-hidden="true">
              <FileCode className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
              {kg.totalFiles} <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>fichiers</span>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {kg.totalEntities.toLocaleString()} entités • {kg.totalLines.toLocaleString()} lignes
            </p>
          </div>
          <div className="pt-2 border-t text-xs flex justify-between" style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}>
            <span>Exports : {kg.totalExports}</span>
            <span>Imports : {kg.totalImports}</span>
          </div>
        </article>

        {/* Card 2: Project Memory */}
        <article
          className="p-4 rounded-2xl border space-y-3"
          style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
          aria-label={`Project Memory : ${pm.totalFacts} faits sur ${pm.maxFacts}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Project Memory
            </span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400" aria-hidden="true">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black flex items-baseline gap-2" style={{ color: 'var(--text-primary)' }}>
              {pm.totalFacts}
              <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>/ {pm.maxFacts} faits</span>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              <span className="text-emerald-400 font-semibold">{pm.structuralFacts}</span> faits structurels protégés
            </p>
          </div>
          <div className="space-y-1 pt-1">
            <div
              className="h-1.5 w-full rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--bg-hover)' }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={pm.maxFacts}
              aria-valuenow={pm.totalFacts}
              aria-label={`${pm.totalFacts} faits sur ${pm.maxFacts}`}
            >
              <div
                className="h-full rounded-full transition-all bg-gradient-to-r from-cyan-500 to-blue-500"
                style={{ width: `${Math.min(100, (pm.totalFacts / pm.maxFacts) * 100)}%` }}
              />
            </div>
          </div>
        </article>

        {/* Card 3: Dependency Graph */}
        <article
          className="p-4 rounded-2xl border space-y-3"
          style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
          aria-label={`Graphe des dépendances : ${dg.cycleCount} cycle${dg.cycleCount !== 1 ? 's' : ''} circulaire${dg.cycleCount !== 1 ? 's' : ''}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Graphe Dépendances
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400" aria-hidden="true">
              <GitBranch className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              {dg.cycleCount === 0
                ? <span className="text-emerald-400">0 Cycles</span>
                : <span className="text-amber-400">{dg.cycleCount} Cycles</span>
              }
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {dg.cycleCount === 0 ? 'Aucune dépendance circulaire' : 'Implications sur la maintenabilité'}
            </p>
          </div>
          <div className="pt-2 border-t text-xs flex justify-between" style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}>
            <span>Statut : {dg.cycleCount === 0 ? 'Sain' : 'Attention'}</span>
            <span>DFS Inspector : Actif</span>
          </div>
        </article>

        {/* Card 4: Documents */}
        <article
          className="p-4 rounded-2xl border space-y-3"
          style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
          aria-label={`Documents extraits : ${docsData?.documentCount ?? 0}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Documents Extraits
            </span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400" aria-hidden="true">
              <FileCode className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
              {docsData?.documentCount ?? 0}{' '}
              <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>documents</span>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {docsData?.extractor?.watching ? (
                <span className="text-emerald-400 inline-flex items-center gap-1">
                  <Zap size={12} aria-hidden="true" /> Extraction temps réel active
                </span>
              ) : (
                <span className="text-amber-400">En attente d'activation</span>
              )}
            </p>
          </div>
          <div className="pt-2 border-t text-xs flex justify-between" style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}>
            <span>Auto-scan : {docsData?.extractor?.watching ? 'ON' : 'OFF'}</span>
            <button
              onClick={handleReextract}
              disabled={reextracting}
              className="text-cyan-400 hover:underline font-medium"
              aria-label={reextracting ? 'Ré-extraction en cours' : 'Ré-extraire les documents'}
              aria-busy={reextracting}
            >
              {reextracting ? '...' : 'Ré-extraire'}
            </button>
          </div>
        </article>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div
          id={tablistId}
          role="tablist"
          aria-label="Sections du dashboard"
          className="flex items-center gap-2 border-b pb-2 overflow-x-auto"
          style={{ borderColor: 'var(--border-base)' }}
        >
          {TABS.filter(t => !t.hidden).map(tab => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              aria-label={tab.ariaLabel}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? tab.id === 'ast'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                    : tab.id === 'dependencies'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-[var(--bg-active)] text-white shadow-sm'
                  : tab.id === 'ast'
                  ? 'text-cyan-400/80 hover:text-cyan-300 hover:bg-cyan-500/10'
                  : tab.id === 'dependencies'
                  ? 'text-amber-400/80 hover:bg-amber-500/10'
                  : 'text-muted hover:text-white hover:bg-[var(--bg-hover)]'
              }`}
            >
              {tab.id === 'ast' && <GitFork className="w-3.5 h-3.5" aria-hidden="true" />}
              {tab.id === 'dependencies' && <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Panel: AST */}
        <div
          id="panel-ast"
          role="tabpanel"
          aria-labelledby="tab-ast"
          hidden={activeTab !== 'ast'}
          className="pt-2"
        >
          {activeTab === 'ast' && <ASTCallGraphExplorer />}
        </div>

        {/* Panel: Overview */}
        <div
          id="panel-overview"
          role="tabpanel"
          aria-labelledby="tab-overview"
          hidden={activeTab !== 'overview'}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}>
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <HardDrive className="w-4 h-4" style={{ color: '#00c2ff' }} aria-hidden="true" />
                Détails de Persistance Disque
              </h3>
              <div className="space-y-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <div className="flex justify-between p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-base)' }}>
                  <span>Fichier de Graphe :</span>
                  <code className="font-mono text-emerald-400">.project-knowledge.json</code>
                </div>
                <div className="flex justify-between p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-base)' }}>
                  <span>Mémoire Métier :</span>
                  <code className="font-mono text-purple-400">.project-memory.json</code>
                </div>
                <div className="flex justify-between p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-base)' }}>
                  <span>Statut Auto-Indexation :</span>
                  <span className="text-emerald-400 font-semibold">Protégé contre doublons</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}>
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Layers className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                Répartition des Faits en Mémoire
              </h3>
              <div className="space-y-2">
                {Object.entries(pm.categoryBreakdown).length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Aucune catégorie enregistrée.</p>
                ) : (
                  Object.entries(pm.categoryBreakdown).map(([cat, count]) => (
                    <div key={cat} className="flex items-center justify-between text-xs">
                      <span className="capitalize" style={{ color: 'var(--text-muted)' }}>{cat}</span>
                      <span
                        className="font-semibold px-2 py-0.5 rounded-full text-sm"
                        style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
                        aria-label={`${count} fait${count > 1 ? 's' : ''} dans la catégorie ${cat}`}
                      >
                        {count} fait{count > 1 ? 's' : ''}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Panel: Memory */}
        <div
          id="panel-memory"
          role="tabpanel"
          aria-labelledby="tab-memory"
          hidden={activeTab !== 'memory'}
          className="p-4 rounded-2xl border space-y-3"
          style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400">
              Structure & Protection de la Mémoire
            </h3>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Max : {pm.maxFacts} faits (élagage automatique au-delà)
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Les faits avec le badge{' '}
            <span className="text-emerald-400 font-semibold">isStructural</span>{' '}
            sont automatiquement immunisés contre l'élagage GC même s'ils sont peu consultés.
          </p>
        </div>

        {/* Panel: Documents */}
        <div
          id="panel-documents"
          role="tabpanel"
          aria-labelledby="tab-documents"
          hidden={activeTab !== 'documents'}
          className="p-4 rounded-2xl border space-y-3"
          style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <FileCode className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              Documents Extraits Automatiquement
            </h3>
            <button
              onClick={handleReextract}
              disabled={reextracting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
              style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
              aria-label={reextracting ? 'Ré-extraction en cours' : 'Ré-extraire tous les documents'}
              aria-busy={reextracting}
            >
              <RefreshCw className={`w-3 h-3 ${reextracting ? 'animate-spin' : ''}`} aria-hidden="true" />
              {reextracting ? 'Extraction...' : 'Ré-extraire tout'}
            </button>
          </div>

          {docsData && docsData.documents.length > 0 ? (
            <ul className="space-y-2 max-h-[400px] overflow-y-auto" aria-label="Liste des documents extraits">
              {docsData.documents.map((doc) => (
                <li
                  key={doc.id}
                  className="p-3 rounded-xl border transition-colors hover:border-cyan-500/30"
                  style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-base)' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {doc.fileName}
                        </span>
                        <span
                          className="px-1.5 py-0.5 rounded text-xs font-mono flex-shrink-0"
                          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                          aria-label={`Type : ${doc.mimeType}`}
                        >
                          {doc.mimeType.split('/')[1] || doc.mimeType}
                        </span>
                      </div>
                      <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                        {doc.summary}
                      </p>
                    </div>
                    <span
                      className="text-xs flex-shrink-0 font-mono"
                      style={{ color: 'var(--text-dimmed)' }}
                      aria-label={`${(doc.textLength / 1000).toFixed(1)} milliers de caractères`}
                    >
                      {(doc.textLength / 1000).toFixed(1)}k
                    </span>
                  </div>
                  {doc.tags.length > 0 && (
                    <ul className="flex flex-wrap gap-1 mt-2 list-none" aria-label="Étiquettes">
                      {doc.tags.slice(0, 5).map((tag, i) => (
                        <li
                          key={i}
                          className="px-1.5 py-0.5 rounded text-xs"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)', color: 'var(--accent-primary)' }}
                        >
                          {tag}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-8" aria-live="polite">
              <FileCode className="w-10 h-10 mx-auto mb-2 opacity-30" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Aucun document extrait. Cliquez sur "Ré-extraire tout" ou attendez le prochain scan automatique.
              </p>
            </div>
          )}

          <div className="pt-3 border-t text-sm flex items-center gap-4" style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}>
            <span>Formats : <code>.md</code> <code>.txt</code> <code>.rst</code> <code>.adoc</code> <code>.tex</code> <code>.yaml</code> <code>.csv</code></span>
            <span className="ml-auto">
              {docsData?.extractor?.watching ? (
                <span className="inline-flex items-center gap-1" aria-label="Surveillance active">
                  <Circle size={9} fill="var(--color-success)" style={{ color: 'var(--color-success)' }} aria-hidden="true" />
                  Surveillance active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1" aria-label="Surveillance inactive">
                  <Circle size={9} fill="var(--color-error)" style={{ color: 'var(--color-error)' }} aria-hidden="true" />
                  Surveillance inactive
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Panel: Dependencies */}
        {dg.cycleCount > 0 && (
          <div
            id="panel-dependencies"
            role="tabpanel"
            aria-labelledby="tab-dependencies"
            hidden={activeTab !== 'dependencies'}
            className="p-4 rounded-2xl border space-y-3 bg-amber-500/5 border-amber-500/20"
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" aria-hidden="true" />
              Cycles de Dépendances Circulaires Détectés
            </h3>
            <ol className="space-y-2" aria-label={`${dg.cycleCount} cycle${dg.cycleCount !== 1 ? 's' : ''} détecté${dg.cycleCount !== 1 ? 's' : ''}`}>
              {dg.cycles.map((cycle, i) => (
                <li
                  key={i}
                  className="p-3 rounded-xl bg-black/30 border border-amber-500/20 font-mono text-xs text-amber-200"
                  aria-label={`Cycle ${i + 1} : ${cycle.join(' → ')}`}
                >
                  {cycle.join(' ➔ ')}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
