import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Code2,
  BookOpen,
  ArrowRight,
  FolderClock,
  FolderOpen,
  GitBranch,
  Loader2,
  Folder,
  Layers,
  ChevronRight,
  Compass,
} from 'lucide-react';
// @ts-ignore - Asset handled by bundler
import bgVideo from '../../assets/video.mp4';
// @ts-ignore - Asset handled by bundler
import logo from '../../assets/images/logo-sombre.png';
import { ideApi } from '../services/ideApi.js';

/**
 * LauncherModal — écran d'accueil et de sélection immersif affiché au démarrage.
 *
 * Permet de :
 *   - Reprendre instantanément le dernier projet actif
 *   - Explorer et ouvrir un autre dossier, clone ou FTP
 *   - Lancer l'environnement Notebooks
 */

const LAUNCHER_DONE_KEY = 'Leanna-launcher-done';
const NO_WORKSPACE_KEY = 'Leanna-no-workspace-mode';

const OVERLAY_FADE = { duration: 0.25, ease: 'easeOut' as const };

interface WorkspaceItem {
  id: string;
  name: string;
  path: string;
  siteUrl?: string;
  lastOpened: string;
  createdAt: string;
  isGit: boolean;
  gitBranch?: string;
}

export function LauncherModal() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const shouldReduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [lastWorkspace, setLastWorkspace] = useState<WorkspaceItem | null>(null);
  const [isOpeningLast, setIsOpeningLast] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(LAUNCHER_DONE_KEY) === '1') {
      setIsOpen(false);
      return;
    }
    if (pathname === '/' || pathname === '/ide') {
      setIsOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Récupération du dernier projet
  useEffect(() => {
    const fetchRecent = async () => {
      try {
        const res = await fetch('/api/self-root/workspaces');
        if (res.ok) {
          const data = await res.json();
          if (data?.workspaces && data.workspaces.length > 0) {
            setLastWorkspace(data.workspaces[0]);
          }
        }
      } catch {
        /* silent */
      }
    };
    fetchRecent();
  }, []);

  // Réouverture événementielle
  useEffect(() => {
    const handleReopen = () => {
      setIsOpen(true);
      fetch('/api/self-root/workspaces')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.workspaces && data.workspaces.length > 0) {
            setLastWorkspace(data.workspaces[0]);
          }
        })
        .catch(() => {});
    };
    window.addEventListener('Leanna-open-launcher', handleReopen);
    return () => window.removeEventListener('Leanna-open-launcher', handleReopen);
  }, []);

  const openLastProject = useCallback(async () => {
    if (!lastWorkspace || isOpeningLast) return;
    setIsOpeningLast(true);
    try {
      const res = await fetch('/api/self-root/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: lastWorkspace.path,
          userConfirmed: true,
          siteUrl: lastWorkspace.siteUrl || '',
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        sessionStorage.setItem(LAUNCHER_DONE_KEY, '1');
        sessionStorage.removeItem(NO_WORKSPACE_KEY);
        ideApi.invalidateCache();
        window.dispatchEvent(new CustomEvent('Leanna-sandbox-changed'));
        window.dispatchEvent(
          new CustomEvent('Leanna-workspace-changed', {
            detail: { workspace: data.newRoot || lastWorkspace.path },
          }),
        );
        setIsOpen(false);
        navigate('/ide');
        return;
      }
    } catch (e) {
      console.error('Erreur lors de la réouverture du dernier projet:', e);
    } finally {
      setIsOpeningLast(false);
    }

    openWorkspaceSwitcher();
  }, [lastWorkspace, isOpeningLast, navigate]);

  const openWorkspaceSwitcher = useCallback(() => {
    sessionStorage.setItem(LAUNCHER_DONE_KEY, '1');
    sessionStorage.removeItem(NO_WORKSPACE_KEY);
    setIsOpen(false);
    navigate('/ide');
    window.dispatchEvent(new CustomEvent('Leanna-open-workspace-switcher'));
  }, [navigate]);

  const openNotebooks = useCallback(() => {
    sessionStorage.setItem(LAUNCHER_DONE_KEY, '1');
    sessionStorage.setItem(NO_WORKSPACE_KEY, '1');
    window.dispatchEvent(new CustomEvent('Leanna-no-workspace-mode'));
    setIsOpen(false);
    navigate('/notebooks');
  }, [navigate]);

  if (!isOpen) return null;

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.94, y: 16 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: 'spring' as const,
        stiffness: 300,
        damping: 28,
        staggerChildren: 0.08,
        delayChildren: 0.05,
      },
    },
    exit: { opacity: 0, scale: 0.95, y: 12, transition: { duration: 0.2 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15, scale: 0.97 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: 'easeOut' as const } },
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={OVERLAY_FADE}
        className="fixed inset-0 z-[100000] flex items-center justify-center p-4 sm:p-6 overflow-hidden select-none"
        style={{ backgroundColor: 'rgba(5, 7, 12, 0.72)' }}
      >
        {/* ── Vidéo d'ambiance ── */}
        <video
          className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-45 mix-blend-screen"
          src={bgVideo}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
        />

        {/* ── Orbes de lumière atmosphériques animés ── */}
        {!shouldReduceMotion && (
          <>
            <motion.div
              animate={{
                x: [-30, 30, -30],
                y: [-20, 20, -20],
                scale: [1, 1.15, 1],
                opacity: [0.35, 0.55, 0.35],
              }}
              transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -top-32 -left-32 w-96 h-96 rounded-full pointer-events-none blur-[100px]"
              style={{
                background: 'radial-gradient(circle, var(--accent-primary) 0%, transparent 70%)',
              }}
            />
            <motion.div
              animate={{
                x: [30, -30, 30],
                y: [20, -20, 20],
                scale: [1.1, 0.95, 1.1],
                opacity: [0.25, 0.45, 0.25],
              }}
              transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -bottom-32 -right-32 w-[28rem] h-[28rem] rounded-full pointer-events-none blur-[110px]"
              style={{
                background: 'radial-gradient(circle, var(--accent-secondary) 0%, transparent 70%)',
              }}
            />
          </>
        )}

        {/* ── Voile de flou dynamique ── */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: 'rgba(6, 9, 16, 0.5)',
            backdropFilter: 'blur(20px) saturate(160%)',
            WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          }}
        />

        {/* ── Carte Modale Principale ── */}
        <motion.div
          variants={shouldReduceMotion ? undefined : containerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-labelledby="launcher-title"
          className="relative z-10 w-full max-w-5xl rounded-3xl p-6 sm:p-9 shadow-2xl flex flex-col overflow-hidden border"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bg-panel) 78%, rgba(13, 17, 26, 0.85))',
            borderColor: 'color-mix(in srgb, var(--accent-primary) 28%, rgba(255, 255, 255, 0.12))',
            boxShadow:
              '0 32px 100px -15px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 0 40px -10px color-mix(in srgb, var(--accent-primary) 15%, transparent)',
          }}
        >
          {/* Ligne lumineuse en haut de la modale */}
          <div
            className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, var(--accent-primary) 30%, var(--accent-secondary) 70%, transparent 100%)',
            }}
          />

          {/* ── Header ── */}
          <motion.div
            variants={shouldReduceMotion ? undefined : itemVariants}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7 pb-6 border-b border-[var(--border-base)]/50"
          >
            <div className="flex items-center gap-4">
              <motion.div
                whileHover={shouldReduceMotion ? undefined : { rotate: 12, scale: 1.08 }}
                className="relative w-13 h-13 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg overflow-hidden"
                style={{
                  background:
                    'linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 30%, transparent) 0%, color-mix(in srgb, var(--accent-secondary) 20%, transparent) 100%)',
                  border: '1px solid color-mix(in srgb, var(--accent-primary) 45%, transparent)',
                  boxShadow: '0 8px 24px -4px color-mix(in srgb, var(--accent-primary) 35%, transparent)',
                }}
              >
                <img
                  src={logo}
                  alt="Leanna"
                  className="w-13 h-13 object-contain"
                  draggable={false}
                />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-primary)] opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--accent-primary)]" />
                </span>
              </motion.div>

              <div>
                <div className="flex items-center gap-2">
                  
                  <span className="text-xs text-[var(--text-muted)] font-mono opacity-70">
                    v1.6.0 • Environnement actif
                  </span>
                </div>

                <h2
                  id="launcher-title"
                  className="text-xl sm:text-1xl font-black tracking-tight mt-1.5 flex items-center gap-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <span>Que souhaitez-vous ouvrir ?</span>
                </h2>
                <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Reprenez vos travaux ou lancez un nouvel espace de travail en un clic.
                </p>
              </div>
            </div>

            {lastWorkspace && (
              <div className="hidden lg:flex items-center gap-2.5 px-3 py-1.5 rounded-xl border bg-[var(--bg-secondary)]/60 border-[var(--border-base)] text-xs text-[var(--text-muted)]">
                <Compass className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>Session précédente mémorisée</span>
              </div>
            )}
          </motion.div>

          {/* ── Grille des Choix ── */}
          <div
            className={`grid gap-4 sm:gap-5 ${
              lastWorkspace ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
            }`}
          >
            {lastWorkspace ? (
              <>
                {/* 1. Carte HÉRO : Dernier projet */}
                <motion.div variants={shouldReduceMotion ? undefined : itemVariants}>
                  <FeaturedProjectCard
                    workspace={lastWorkspace}
                    isLoading={isOpeningLast}
                    onClick={openLastProject}
                    reduceMotion={!!shouldReduceMotion}
                  />
                </motion.div>

                {/* 2. Autre projet / Nouveau */}
                <motion.div variants={shouldReduceMotion ? undefined : itemVariants}>
                  <StandardLauncherCard
                    icon={<FolderOpen className="w-5 h-5" />}
                    title="Autre projet / Nouveau"
                    badge="Explorateur"
                    description="Ouvrir un dossier local, cloner un dépôt GitHub ou configurer un workspace FTP distant."
                    buttonText="Parcourir les projets"
                    accentColor="var(--accent-primary)"
                    onClick={openWorkspaceSwitcher}
                    reduceMotion={!!shouldReduceMotion}
                  />
                </motion.div>

                {/* 3. Notebooks */}
                <motion.div variants={shouldReduceMotion ? undefined : itemVariants}>
                  <StandardLauncherCard
                    icon={<BookOpen className="w-5 h-5" />}
                    title="Ouvrir un Notebook"
                    badge="Créatif & IA"
                    description="Espace dédié aux notes, chat documentaire, sources PDF et génération de contenu assistée."
                    buttonText="Lancer un Notebook"
                    accentColor="var(--accent-secondary)"
                    onClick={openNotebooks}
                    reduceMotion={!!shouldReduceMotion}
                  />
                </motion.div>
              </>
            ) : (
              <>
                {/* Mode initial sans historique */}
                <motion.div variants={shouldReduceMotion ? undefined : itemVariants}>
                  <StandardLauncherCard
                    icon={<Code2 className="w-5 h-5" />}
                    title="Ouvrir l'IDE"
                    badge="Développement"
                    description="Éditeur de code, terminal intégré, orchestration d'agents et outils avancés."
                    buttonText="Sélectionner un projet"
                    accentColor="var(--accent-primary)"
                    onClick={openWorkspaceSwitcher}
                    reduceMotion={!!shouldReduceMotion}
                  />
                </motion.div>

                <motion.div variants={shouldReduceMotion ? undefined : itemVariants}>
                  <StandardLauncherCard
                    icon={<BookOpen className="w-5 h-5" />}
                    title="Ouvrir un Notebook"
                    badge="Recherche & Notes"
                    description="Chat documentaire, synthèses, génération de rapports et manipulation de données."
                    buttonText="Lancer les Notebooks"
                    accentColor="var(--accent-secondary)"
                    onClick={openNotebooks}
                    reduceMotion={!!shouldReduceMotion}
                  />
                </motion.div>
              </>
            )}
          </div>

          {/* ── Footer / Info ── */}
          <motion.div
            variants={shouldReduceMotion ? undefined : itemVariants}
            className="mt-7 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs border-t border-[var(--border-base)]/40 text-[var(--text-muted)]"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 opacity-70 text-[var(--accent-primary)]" />
              <span>Multi-Workspace actif • Bascule instantanée disponible dans l'éditeur</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-block opacity-60">Raccourci switcher :</span>
              <kbd className="px-2 py-0.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-base)] font-mono text-[11px] shadow-sm">
                Ctrl + Maj + P
              </kbd>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Carte VIP / Featured pour le dernier projet ouvert
 */
function FeaturedProjectCard({
  workspace,
  isLoading,
  onClick,
  reduceMotion,
}: {
  workspace: WorkspaceItem;
  isLoading: boolean;
  onClick: () => void;
  reduceMotion: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      whileHover={reduceMotion ? undefined : { y: -5, scale: 1.015 }}
      whileTap={reduceMotion ? undefined : { scale: 0.985 }}
      className="group relative flex flex-col justify-between w-full h-full min-h-[220px] p-5 sm:p-6 rounded-2xl text-left overflow-hidden border transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
      style={{
        background:
          'linear-gradient(145deg, color-mix(in srgb, var(--accent-primary) 14%, var(--bg-secondary)) 0%, color-mix(in srgb, var(--bg-secondary) 95%, transparent) 100%)',
        borderColor: 'color-mix(in srgb, var(--accent-primary) 50%, var(--border-base))',
        boxShadow:
          '0 12px 36px -8px color-mix(in srgb, var(--accent-primary) 22%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
      }}
    >
      {/* Halo lumineux d'arrière-plan */}
      <div
        className="absolute -top-16 -right-16 w-36 h-36 rounded-full blur-2xl pointer-events-none opacity-60 transition-opacity group-hover:opacity-100"
        style={{
          background: 'radial-gradient(circle, var(--accent-primary) 0%, transparent 70%)',
        }}
      />

      {/* Trait de brillance au survol */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none" />

      {/* Haut : Icone + Badge */}
      <div>
        <div className="flex items-center justify-between w-full mb-3.5">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md transition-transform group-hover:scale-105"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--accent-primary) 24%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-primary) 45%, transparent)',
              color: 'var(--accent-primary)',
            }}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <FolderClock className="w-5 h-5" />
            )}
          </div>

          <span
            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border shadow-sm"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--accent-primary) 20%, transparent)',
              borderColor: 'color-mix(in srgb, var(--accent-primary) 45%, transparent)',
              color: 'var(--accent-primary)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse" />
            Dernier projet
          </span>
        </div>

        {/* Titre & Chemin */}
        <h3
          className="text-base sm:text-lg font-bold truncate transition-colors group-hover:text-[var(--accent-primary)]"
          style={{ color: 'var(--text-primary)' }}
          title={workspace.name}
        >
          {workspace.name || 'Projet Récent'}
        </h3>

        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] mt-1 break-all line-clamp-2">
          <Folder className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
          <span className="font-mono text-[11px] opacity-80">{workspace.path}</span>
        </div>

        {/* Métadonnées Git */}
        {workspace.isGit && workspace.gitBranch && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-mono bg-[var(--bg-panel)]/80 border-[var(--border-base)] text-[var(--accent-secondary)]">
            <GitBranch className="w-3 h-3" />
            <span>{workspace.gitBranch}</span>
          </div>
        )}
      </div>

      {/* Bas : Bouton Action */}
      <div className="mt-5 pt-3 border-t border-[var(--border-base)]/40 flex items-center justify-between w-full">
        <span className="text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>
          {isLoading ? 'Ouverture en cours...' : 'Reprendre le travail'}
        </span>

        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:translate-x-1"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--accent-primary) 20%, transparent)',
            color: 'var(--accent-primary)',
          }}
        >
          <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    </motion.button>
  );
}

/**
 * Carte standard (Autre projet, Notebooks, etc.)
 */
function StandardLauncherCard({
  icon,
  title,
  description,
  badge,
  buttonText,
  accentColor,
  onClick,
  reduceMotion,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge: string;
  buttonText: string;
  accentColor: string;
  onClick: () => void;
  reduceMotion: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={reduceMotion ? undefined : { y: -5, scale: 1.015 }}
      whileTap={reduceMotion ? undefined : { scale: 0.985 }}
      className="group relative flex flex-col justify-between w-full h-full min-h-[220px] p-5 sm:p-6 rounded-2xl text-left overflow-hidden border transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border-base)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = accentColor;
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = `color-mix(in srgb, ${accentColor} 8%, var(--bg-secondary))`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-base)';
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-secondary)';
      }}
    >
      {/* Brillance latérale */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none" />

      {/* Haut : Icone + Badge */}
      <div>
        <div className="flex items-center justify-between w-full mb-3.5">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
            style={{
              backgroundColor: `color-mix(in srgb, ${accentColor} 14%, transparent)`,
              border: `1px solid color-mix(in srgb, ${accentColor} 30%, transparent)`,
              color: accentColor,
            }}
          >
            {icon}
          </div>

          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border opacity-80"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--bg-panel) 80%, transparent)',
              borderColor: 'var(--border-base)',
              color: 'var(--text-muted)',
            }}
          >
            {badge}
          </span>
        </div>

        {/* Titre & Description */}
        <h3
          className="text-base sm:text-lg font-bold transition-colors group-hover:text-[var(--text-primary)]"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h3>

        <p className="text-xs sm:text-sm mt-1.5 leading-relaxed text-[var(--text-muted)] line-clamp-3">
          {description}
        </p>
      </div>

      {/* Bas : Bouton Action */}
      <div className="mt-5 pt-3 border-t border-[var(--border-base)]/40 flex items-center justify-between w-full">
        <span className="text-xs font-semibold text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors">
          {buttonText}
        </span>

        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:translate-x-1"
          style={{
            backgroundColor: `color-mix(in srgb, ${accentColor} 14%, transparent)`,
            color: accentColor,
          }}
        >
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>
    </motion.button>
  );
}
