import { Router, Request, Response } from 'express';
import {
  projectDoctor,
  dailyBriefing,
  opportunityEngine,
  projectProfile,
  predictionEngine,
  missionEvolutionStore,
  WorkflowCompiler,
} from '../../knowledge/index.js';

/**
 * Signature coarse (objectif seul), cohérente avec le keying de problème côté
 * Executor / MissionEvolution, pour relier une prédiction à l'historique
 * d'approches de la même classe de problème.
 */
function coarseSignature(objective: string): string {
  const t = objective.toLowerCase();
  const kw =
    /perf|optimi/.test(t) ? 'perf'
      : /refactor|clean/.test(t) ? 'refactor'
        : /test/.test(t) ? 'test'
          : /secur|sécur/.test(t) ? 'security'
            : /doc/.test(t) ? 'docs'
              : /fix|bug|corrige|erreur|error/.test(t) ? 'fix'
                : 'generic';
  const fam = /ts|typescript|type/.test(t) ? 'ts-error' : /fix|bug|erreur|error/.test(t) ? 'error' : 'objective';
  return `${fam}:${kw}`;
}

/**
 * Insights router — expose les moteurs d'intelligence projet (P0/P1) à l'UI
 * « Mission Control » : santé du projet (Project Doctor), briefing quotidien,
 * opportunités proactives et profil projet. Lecture seule, best-effort :
 * un moteur en échec (ex : projet non indexé) renvoie une 200 avec un payload
 * dégradé plutôt qu'une 500, pour que le tableau de bord reste affichable.
 */
const router = Router();

// GET /api/knowledge/doctor — diagnostic santé + missions d'amélioration
router.get('/doctor', (_req: Request, res: Response) => {
  try {
    const report = projectDoctor.diagnose();
    return res.json({ status: 'success', report });
  } catch (e: any) {
    return res.json({ status: 'degraded', report: null, error: e.message });
  }
});

// GET /api/knowledge/daily-briefing — digest matinal composé
router.get('/daily-briefing', (req: Request, res: Response) => {
  try {
    const includeHealth = req.query.includeHealth !== 'false';
    const maxMissions = Number(req.query.maxMissions) || 5;
    const report = dailyBriefing.generate({ includeHealth, maxMissions });
    return res.json({ status: 'success', report });
  } catch (e: any) {
    return res.json({ status: 'degraded', report: null, error: e.message });
  }
});

// GET /api/knowledge/opportunities — travail utile détecté proactivement
router.get('/opportunities', (req: Request, res: Response) => {
  try {
    const includeHealth = req.query.includeHealth !== 'false';
    const limit = Number(req.query.limit) || 15;
    const report = opportunityEngine.scan({ includeHealth, limit });
    return res.json({ status: 'success', report });
  } catch (e: any) {
    return res.json({ status: 'degraded', report: null, error: e.message });
  }
});

// POST /api/knowledge/explain — « pourquoi ? » : facteurs décisionnels
// Compose la prédiction (Predictive Agent) et l'historique d'approches
// (Mission Evolution) en facteurs décisionnels exploitables. Lecture seule.
router.post('/explain', (req: Request, res: Response) => {
  const { objective, description, plannedSkills, errors } = req.body as {
    objective?: string; description?: string; plannedSkills?: string[]; errors?: string[];
  };
  if (!objective || typeof objective !== 'string' || !objective.trim()) {
    return res.status(400).json({ error: "Le paramètre 'objective' est requis." });
  }
  try {
    const prediction = predictionEngine.predict({
      objective: { title: objective.trim(), description, errors },
      plannedSkills: Array.isArray(plannedSkills) ? plannedSkills : [],
    });
    const signature = coarseSignature(objective);
    const evolution = missionEvolutionStore.recommendApproach(signature);

    // Facteurs décisionnels lisibles (le « pourquoi » exploitable, pas le
    // raisonnement interne du modèle).
    const factors: Array<{ label: string; detail: string; tone: 'positive' | 'warning' | 'neutral' }> = [];
    factors.push({ label: 'Probabilité de réussite', detail: `${prediction.successPercent}% (confiance ${Math.round(prediction.confidence * 100)}%)`, tone: prediction.successPercent >= 70 ? 'positive' : prediction.successPercent >= 50 ? 'neutral' : 'warning' });
    if (prediction.playbookId) factors.push({ label: 'Playbook éprouvé', detail: `${prediction.playbookId} — stratégie déjà réussie réutilisée`, tone: 'positive' });
    if (evolution.recommended) factors.push({ label: 'Approche gagnante', detail: `${Math.round(evolution.recommended.successRate * 100)}% sur ${evolution.recommended.attempts} essais`, tone: 'positive' });
    for (const avoid of evolution.avoid) factors.push({ label: 'Approche à éviter', detail: `${avoid.label} (${avoid.failures} échec(s))`, tone: 'warning' });
    if (prediction.weakestStep) factors.push({ label: 'Étape la plus fragile', detail: `${prediction.weakestStep.skillName} — ${Math.round(prediction.weakestStep.failureRisk * 100)}% de risque`, tone: 'warning' });

    return res.json({
      status: 'success',
      signature,
      prediction,
      evolution,
      factors,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/knowledge/automate — « Automatiser » une opportunité : compile une
// demande en workflow (NL→Automation) puis le crée réellement (workflow_create).
router.post('/automate', async (req: Request, res: Response) => {
  const { request, name } = req.body as { request?: string; name?: string };
  if (!request || typeof request !== 'string' || !request.trim()) {
    return res.status(400).json({ error: "Le paramètre 'request' est requis." });
  }
  try {
    const compiled = new WorkflowCompiler().compile(request.trim(), { name });
    // Matérialise le workflow via le chemin skill existant (validation + persistance).
    const { createWorkflow } = await import('../../skills/workflow.js');
    const workflow = await createWorkflow({
      name: compiled.workflow.name,
      description: compiled.workflow.description,
      steps: compiled.workflow.steps.map((s) => ({
        id: s.id,
        action: s.action,
        args: s.args,
        label: s.label,
        onError: s.onError,
      })),
      schedule: compiled.workflow.schedule,
    });
    return res.json({
      status: 'success',
      workflowId: workflow.id,
      name: workflow.name,
      stepCount: workflow.steps.length,
      trigger: compiled.workflow.trigger,
      warnings: compiled.warnings,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/knowledge/profile — profil d'intelligence du projet
router.get('/profile', (_req: Request, res: Response) => {
  try {
    const profile = projectProfile.getProfile();
    return res.json({ status: 'success', profile });
  } catch (e: any) {
    return res.json({ status: 'degraded', profile: null, error: e.message });
  }
});

export default router;
