import { Router, Request, Response } from "express";
import { missionTimeTravel, type TimelineMissionView } from "../mission/index.js";
import { projectDoctor } from "../knowledge/index.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Missions Router — Approbation humaine & curseur d'autonomie
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Expose au frontend les actions liées au curseur d'autonomie :
 *   - approuver / refuser une action en attente (mode "ask")
 *   - lister les approbations en attente d'une mission
 *   - lire et modifier le mode d'autonomie (suggest / ask / auto)
 *
 * L'Executor est fourni via un getter, car il est initialisé de façon
 * asynchrone dans le bootstrap (peut être null au tout début).
 */
export function createMissionsRouter(
  getExecutor: () => any | null,
  handleToolCall?: (name: string, args: any) => Promise<any>
): Router {
  const router = Router();

  // ── Créer une mission (chemin déterministe, indépendant du LLM) ──────────
  router.post("/missions", async (req: Request, res: Response) => {
    if (!handleToolCall) {
      return res.status(503).json({ error: "Création de mission indisponible (handler non configuré)." });
    }
    const { title, description, priority, dryRun } = req.body ?? {};
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Champ 'title' (string) requis." });
    }
    if (typeof description !== "string" || !description.trim()) {
      return res.status(400).json({ error: "Champ 'description' (string) requis." });
    }
    try {
      // Réutilise exactement le chemin du skill (validation, skills disponibles, executor).
      const result = await handleToolCall("mission_create", {
        title: title.trim(),
        description: description.trim(),
        priority: priority ?? "medium",
        dryRun: dryRun === true,
      });
      if (result && typeof result === "object" && "error" in result) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Diagnostiquer : créer les missions d'amélioration du Project Doctor ──
  // Lance le diagnostic puis matérialise les missions proposées via le chemin
  // mission_create existant (validation, skills, executor, permissions).
  router.post("/missions/doctor/create", async (req: Request, res: Response) => {
    if (!handleToolCall) {
      return res.status(503).json({ error: "Création de mission indisponible (handler non configuré)." });
    }
    try {
      const report = projectDoctor.diagnose();
      const requestedMax = Number(req.body?.max);
      const max = Number.isInteger(requestedMax) && requestedMax > 0 ? Math.min(requestedMax, 10) : 5;
      const missions = report.improvementMissions.slice(0, max);
      const created: Array<{ missionId: string; title: string }> = [];
      const failed: Array<{ title: string; error: string }> = [];

      for (const m of missions) {
        try {
          const result = await handleToolCall("mission_create", {
            title: m.title,
            description: m.description,
            priority: m.priority,
          });
          if (result && typeof result === "object" && "missionId" in result) {
            created.push({ missionId: String((result as any).missionId), title: m.title });
          } else {
            failed.push({ title: m.title, error: (result as any)?.error ?? "Création refusée." });
          }
        } catch (err) {
          failed.push({ title: m.title, error: (err as Error).message });
        }
      }

      return res.json({ status: "success", global: report.global, created, failed, proposed: missions.length });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Simuler une mission (dry-run bout-en-bout, aucun effet de bord) ──────
  router.post("/missions/simulate", async (req: Request, res: Response) => {
    if (!handleToolCall) {
      return res.status(503).json({ error: "Simulation indisponible (handler non configuré)." });
    }
    const { title, description, priority } = req.body ?? {};
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Champ 'title' (string) requis." });
    }
    try {
      const result = await handleToolCall("mission_simulate", {
        title: title.trim(),
        description: typeof description === "string" && description.trim() ? description.trim() : title.trim(),
        priority: priority ?? "medium",
      });
      if (result && typeof result === "object" && "error" in result) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  const requireExecutor = (res: Response): any | null => {
    const executor = getExecutor();
    if (!executor) {
      res.status(503).json({ error: "Mission System non initialisé." });
      return null;
    }
    return executor;
  };

  /** Sérialise une Mission (instance) vers la forme attendue par le frontend. */
  const serializeMission = (mission: any, executor?: any) => {
    const state = mission.getState();
    // L'état de pause est suivi dans l'Executor (pas dans mission.status, qui
    // reste "in_progress" pendant une pause). On l'expose explicitement pour que
    // l'UI puisse proposer la bonne action (pause vs reprise).
    const paused = typeof executor?.isPaused === "function" ? executor.isPaused(state.id) === true : false;
    const goalsRecord = state.goals ?? {};
    // Sous-objectifs = tous les goals ayant un parent (on exclut la racine).
    const goals = Object.values(goalsRecord)
      .filter((g: any) => g.parentId !== null)
      .map((g: any) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        actions: (g.plannedActions ?? []).map((a: any) => ({
          id: a.id,
          skill: a.skillName,
          status: a.status,
          confidence: a.reflection?.confidence,
          decision: a.reflection?.decision,
          durationMs: undefined,
        })),
      }));

    return {
      id: state.id,
      title: state.title,
      status: state.status,
      paused,
      priority: state.priority,
      goals,
      activeGoalId: state.activeGoalId,
      confidence: state.metrics?.averageConfidence ?? 0.5,
      metrics: {
        totalActions: state.metrics?.totalActions ?? 0,
        successfulActions: state.metrics?.successfulActions ?? 0,
        failedActions: state.metrics?.failedActions ?? 0,
      },
      createdAt: state.createdAt,
    };
  };

  // ── Lister les missions (actives + complétées) — état initial du panneau ──
  router.get("/missions", (_req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;
    try {
      const active = (executor.listActiveMissions?.() ?? []).map((m: any) => serializeMission(m, executor));
      const completed = (executor.listCompletedMissions?.() ?? []).map((m: any) => serializeMission(m, executor));
      return res.json({ missions: [...active, ...completed] });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  /** Resolve a mission instance by id from active or completed lists. */
  const findMission = (executor: any, id: string): any | undefined =>
    executor.getMission?.(id) ??
    (executor.listCompletedMissions?.() ?? []).find((m: any) => m.id === id);

  // ── Mission Time Travel : timeline chronologique reconstruite ────────────
  router.get("/missions/:id/timeline", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;
    const mission = findMission(executor, req.params.id);
    if (!mission) {
      return res.status(404).json({ error: "Mission introuvable.", missionId: req.params.id });
    }
    try {
      const timeline = missionTimeTravel.buildTimeline(mission.getState() as TimelineMissionView);
      return res.json({ status: "success", timeline });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Rewind : instantané d'une étape + trace y menant ─────────────────────
  router.get("/missions/:id/timeline/:step", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;
    const mission = findMission(executor, req.params.id);
    if (!mission) {
      return res.status(404).json({ error: "Mission introuvable.", missionId: req.params.id });
    }
    const step = Number(req.params.step);
    if (!Number.isInteger(step) || step < 0) {
      return res.status(400).json({ error: "Index d'étape invalide." });
    }
    try {
      const { target, trail } = missionTimeTravel.rewindTo(mission.getState() as TimelineMissionView, step);
      if (!target) {
        return res.status(404).json({ error: `Étape ${step} hors limites.` });
      }
      return res.json({ status: "success", target, trail });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Approuver / refuser une action en attente ────────────────────────────
  router.post("/missions/:id/approve", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;

    const { actionId, approved } = req.body ?? {};
    if (typeof actionId !== "string" || !actionId.trim()) {
      return res.status(400).json({ error: "Champ 'actionId' (string) requis." });
    }
    if (typeof approved !== "boolean") {
      return res.status(400).json({ error: "Champ 'approved' (boolean) requis." });
    }

    const resolved = executor.resolveApproval(actionId, approved);
    if (!resolved) {
      return res.status(404).json({
        error: "Aucune approbation en attente pour cet actionId (peut-être déjà résolue ou expirée).",
        actionId,
      });
    }
    return res.json({ ok: true, actionId, approved });
  });

  // ── Mettre une mission en pause ──────────────────────────────────────────
  router.post("/missions/:id/pause", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;

    const missionId = req.params.id;
    const ok = executor.pauseMission?.(missionId) ?? false;
    if (!ok) {
      return res.status(404).json({
        error: "Mission introuvable, déjà en pause, ou non active.",
        missionId,
      });
    }
    return res.json({ ok: true, missionId, status: "paused" });
  });

  // ── Reprendre une mission en pause ───────────────────────────────────────
  router.post("/missions/:id/resume", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;

    const missionId = req.params.id;
    const ok = executor.resumeMission?.(missionId) ?? false;
    if (!ok) {
      return res.status(404).json({
        error: "Mission introuvable ou non en pause.",
        missionId,
      });
    }
    return res.json({ ok: true, missionId, status: "in_progress" });
  });

  // ── Annuler une mission active ───────────────────────────────────────────
  router.post("/missions/:id/cancel", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;

    const missionId = req.params.id;
    const ok = executor.cancelMission?.(missionId) ?? false;
    if (!ok) {
      return res.status(404).json({
        error: "Mission introuvable ou déjà terminée.",
        missionId,
      });
    }
    return res.json({ ok: true, missionId, status: "cancelled" });
  });

  // ── Supprimer une mission (active → annulée puis retirée, ou historique) ──
  router.delete("/missions/:id", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;

    const missionId = req.params.id;
    const ok = executor.deleteMission?.(missionId) ?? false;
    if (!ok) {
      return res.status(404).json({ error: "Mission introuvable.", missionId });
    }
    return res.json({ ok: true, missionId, deleted: true });
  });

  // ── Lister les approbations en attente ───────────────────────────────────
  router.get("/missions/pending-approvals", (_req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;
    return res.json({ pending: executor.listPendingApprovals() });
  });

  // ── Lister les missions interrompues en attente de décision ──────────────
  // (reprise au démarrage : réactiver ou effacer).
  router.get("/missions/pending-resumes", (_req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;
    return res.json({ pending: executor.listPendingResumes?.() ?? [] });
  });

  // ── Décider du sort d'une mission interrompue (réactiver / effacer) ──────
  router.post("/missions/:id/resume-decision", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;

    const missionId = req.params.id;
    const { decision } = req.body ?? {};
    if (decision !== "reactivate" && decision !== "delete") {
      return res.status(400).json({
        error: "Champ 'decision' invalide (reactivate | delete).",
      });
    }

    const ok = executor.confirmResume?.(missionId, decision) ?? false;
    if (!ok) {
      return res.status(404).json({
        error: "Aucune mission interrompue en attente pour cet ID (déjà décidée ou inexistante).",
        missionId,
      });
    }
    return res.json({ ok: true, missionId, decision });
  });

  // ── Lire le mode d'autonomie courant ─────────────────────────────────────
  router.get("/missions/autonomy", (_req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;
    const policy = executor.getAutonomyPolicy?.();
    if (!policy) return res.json({ mode: null, enabled: false });
    return res.json({ mode: policy.getMode(), enabled: true });
  });

  // ── Modifier le mode d'autonomie ─────────────────────────────────────────
  router.post("/missions/autonomy", (req: Request, res: Response) => {
    const executor = requireExecutor(res);
    if (!executor) return;

    const { mode } = req.body ?? {};
    if (!["suggest", "ask", "auto"].includes(mode)) {
      return res.status(400).json({ error: "Champ 'mode' invalide (suggest | ask | auto)." });
    }
    const policy = executor.getAutonomyPolicy?.();
    if (!policy) return res.status(503).json({ error: "Curseur d'autonomie non configuré." });

    policy.setMode(mode);
    return res.json({ ok: true, mode });
  });

  return router;
}
