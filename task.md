Améliorer l'autonomie de Leanna — action seule + vocal toujours actif + sensation de « vivant »
Voici un plan concret, ancré dans ton code réel. J'ai lu LeannaCore, HeartbeatService, PerceptionEngine, AutonomousExecutive, LiveSocketHandler et server.ts : la base est solide, mais trois verrous empêchent Leanna d'agir seule de façon « vivante ».

🔒 Diagnostic : les 3 verrous actuels
Verrou	Où c'est	Effet
1. Mode ask par défaut	.env.example → LEANNA_AUTONOMY_MODE="ask" + server.ts (fallback "ask")	Chaque action à effet de bord se met en pause et attend un humain → plus personne n'agit si tu n'es pas devant l'écran
2. Perception purement réactive	PerceptionEngine ne réagit qu'aux events du bus	Aucune initiative : pas de « je m'ennuie, je vais observer ceci », pas de « ce fichier a changé il y a 3 h, je devrais re-vérifier »
3. Vocal = session à la demande	LiveSocketHandler ouvre une session Gemini Live uniquement quand le frontend se connecte à /live	Aucune présence vocale continue, aucun réveil ambiant
✅ Amélioration 1 — Mode auto par défaut + auto-approbation ciblée
server.ts (remplacer le fallback)
ts
// AVANT — ligne ~330 dans onReady
const rawMode = (process.env.LEANNA_AUTONOMY_MODE || "ask").toLowerCase();

// APRÈS — défaut = auto, mais "ask" reste possible si demandé explicitement
const rawMode = (process.env.LEANNA_AUTONOMY_MODE || "auto").toLowerCase();
const autonomyMode = (["suggest", "ask", "auto"].includes(rawMode) ? rawMode : "auto") as
  | "suggest" | "ask" | "auto";
.env.example
env
# LEANNA_AUTONOMY_MODE : curseur d'autonomie du runtime.
#   suggest → propose sans agir | ask → demande avant d'agir | auto (défaut) → agit
LEANNA_AUTONOMY_MODE="auto"

# Filet de sécurité en mode auto : les actions DANGEREUSES (dangerous)
# restent en attente d'approbation même en auto, sauf si ce flag est "true".
LEANNA_AUTO_ALLOW_DANGEROUS="false"

# En mode auto, approuve automatiquement les actions non-dangereuses
# après N secondes si aucun humain ne répond (0 = jamais, défaut).
LEANNA_AUTO_APPROVE_TIMEOUT_S="30"
server/mission/AutonomyPolicy.ts (logique à ajouter)
ts
// En mode auto : auto-approbation des actions non-dangereuses après timeout.
// Les actions `dangerous` (git_push, delete, system_execute_command)
// nécessitent TOUJOURS une approbation humaine, même en auto.
private shouldAutoApprove(toolName: string, permissions: string[]): boolean {
  if (this.mode !== "auto") return false;
  if (process.env.LEANNA_AUTO_ALLOW_DANGEROUS === "true") return true;
  return !permissions.includes("dangerous");
}
Résultat : Leanna lance et exécute ses missions seule, mais git push, rm -rf, system_execute_command restent humains-par-défaut.

✅ Amélioration 2 — Perception proactive (« pensées de fond »)
Créer un nouveau module : server/autonomy/CuriosityEngine.ts

ts
/**
 * CuriosityEngine — pensées de fond de Leanna.
 *
 * Contrairement à PerceptionEngine (réactif, événementiel), ce moteur
 * produit périodiquement des "pensées" internes à partir de l'état du
 * workspace : fichiers non vérifiés depuis longtemps, TODOs oubliés,
 * erreurs préexistantes non traitées, opportunités d'amélioration.
 *
 * Ces pensées alimentent le même pipeline (Perception → Executive → Mission)
 * mais SANS événement externe : c'est ce qui donne l'impression d'une IA
 * "vivante" qui remarque des choses par elle-même.
 *
 * Déterministe, aucune requête LLM : uniquement de l'analyse locale.
 * Borné : au plus N pensées par cycle, dédup par fingerprint.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { SELF_ROOT } from "../utils/selfRoot.js";
import { projectMemory } from "../knowledge/ProjectMemory.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("CuriosityEngine");

export interface CuriosityThought {
  fingerprint: string;
  kind: "stale_file" | "todo_backlog" | "unverified_change" | "idle_reflection";
  title: string;
  detail: string;
  suggestedAction?: string;
  confidence: number; // 0..1
}

export interface CuriosityOptions {
  /** Intervalle minimum entre deux cycles (ms). Défaut 5 min. */
  cycleIntervalMs?: number;
  /** Au plus N pensées émises par cycle. Défaut 3. */
  maxThoughtsPerCycle?: number;
  /** Fichier non vérifié depuis N ms → pensée. Défaut 6 h. */
  staleFileThresholdMs?: number;
}

export class CuriosityEngine {
  private timer: NodeJS.Timeout | null = null;
  private seen = new Set<string>();
  private opts: Required<CuriosityOptions>;

  constructor(
    private readonly onThought: (thought: CuriosityThought) => void | Promise<void>,
    options: CuriosityOptions = {},
  ) {
    this.opts = {
      cycleIntervalMs: options.cycleIntervalMs ?? 5 * 60_000,
      maxThoughtsPerCycle: options.maxThoughtsPerCycle ?? 3,
      staleFileThresholdMs: options.staleFileThresholdMs ?? 6 * 60 * 60_000,
    };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.think().catch((e) => log.warn(`Cycle échoué: ${e.message}`));
    }, this.opts.cycleIntervalMs);
    this.timer.unref?.();
    log.info(`CuriosityEngine actif (cycle ${this.opts.cycleIntervalMs}ms)`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Exécute un cycle d'introspection. Appelable manuellement (tests, /api/autonomy/think). */
  async think(): Promise<CuriosityThought[]> {
    const thoughts: CuriosityThought[] = [];
    const now = Date.now();

    // 1. Fichiers récemment modifiés mais jamais re-vérifiés
    if (SELF_ROOT) {
      const candidates = this.scanRecentFiles(now).slice(0, 2);
      for (const f of candidates) {
        thoughts.push(this.makeThought("unverified_change", f.path, {
          detail: `Modifié il y a ${Math.round((now - f.mtimeMs) / 60_000)} min, aucune vérification enregistrée depuis.`,
          suggestedAction: `verify_typecheck sur ${f.path}`,
          confidence: 0.7,
        }));
      }
    }

    // 2. TODO/FIXME orphelins dans la mémoire projet
    try {
      const todos = await this.collectOutstandingTodos();
      if (todos.count > 0) {
        thoughts.push(this.makeThought("todo_backlog", "todo-backlog", {
          detail: `${todos.count} TODO/FIXME non résolus dans le workspace.`,
          suggestedAction: "audit des TODO/FIXME",
          confidence: 0.5,
        }));
      }
    } catch { /* mémoire optionnelle */ }

    // 3. Réflexion oisive : c'est ici qu'on donne à Leanna
    //    une "voix intérieure". Déterministe, faible confiance.
    if (thoughts.length === 0) {
      thoughts.push(this.makeThought("idle_reflection", "idle", {
        detail: "Aucun signal urgent — Leanna réfléchit au contexte projet.",
        suggestedAction: "synthèse du contexte projet",
        confidence: 0.3,
      }));
    }

    const filtered = thoughts
      .filter((t) => !this.seen.has(t.fingerprint))
      .slice(0, this.opts.maxThoughtsPerCycle);

    for (const t of filtered) {
      this.seen.add(t.fingerprint);
      // TTL implicite : on borne la mémoire de dédup
      if (this.seen.size > 500) this.seen.clear();
      await this.onThought(t);
    }
    return filtered;
  }

  private makeThought(
    kind: CuriosityThought["kind"],
    seed: string,
    body: Omit<CuriosityThought, "fingerprint" | "kind" | "title">,
  ): CuriosityThought {
    const fingerprint = createHash("sha256").update(`${kind}:${seed}`).digest("hex").slice(0, 16);
    return {
      fingerprint,
      kind,
      title: titleFor(kind),
      ...body,
    };
  }

  private scanRecentFiles(now: number): Array<{ path: string; mtimeMs: number }> {
    const out: Array<{ path: string; mtimeMs: number }> = [];
    const skip = new Set(["node_modules", ".git", "dist", "build", ".Leanna"]);
    const walk = (dir: string, depth = 0) => {
      if (depth > 4) return;
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (skip.has(e.name)) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, depth + 1);
        else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) {
          try {
            const st = fs.statSync(full);
            if (now - st.mtimeMs < this.opts.staleFileThresholdMs) {
              out.push({ path: path.relative(SELF_ROOT, full), mtimeMs: st.mtimeMs });
            }
          } catch { /* ignore */ }
        }
      }
    };
    walk(SELF_ROOT);
    return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  }

  private async collectOutstandingTodos(): Promise<{ count: number }> {
    // ProjectMemory expose un listing ; on compte simplement les entrées
    // taggées "todo" ou "fixme" si le store le supporte.
    if (typeof (projectMemory as any).listFacts === "function") {
      const facts = await (projectMemory as any).listFacts({ tag: "todo" });
      return { count: Array.isArray(facts) ? facts.length : 0 };
    }
    return { count: 0 };
  }
}

function titleFor(kind: CuriosityThought["kind"]): string {
  switch (kind) {
    case "unverified_change": return "Changement non vérifié";
    case "todo_backlog":      return "Dette technique détectée";
    case "stale_file":        return "Fichier obsolète";
    case "idle_reflection":   return "Réflexion de fond";
  }
}
Intégration dans LeannaCore
ts
// server/autonomy/LeannaCore.ts — dans start()
this.curiosity = new CuriosityEngine(async (thought) => {
  // On passe la pensée au MÊME pipeline que les événements runtime :
  // PerceptionEngine → Executive → Mission. Aucune voie parallèle.
  this.eventBus.emit("curiosity:thought", {
    type: "curiosity:thought",
    payload: thought,
    timestamp: Date.now(),
  });
});
this.curiosity.start();
Et dans PerceptionEngine, ajouter une branche :

ts
if (event.type === "curiosity:thought") {
  const t = event.payload as CuriosityThought;
  if (t.confidence < 0.4) return { importance: "low", attention: "observe", action: "ignore" };
  return {
    importance: t.confidence > 0.6 ? "medium" : "low",
    attention: "observe",
    action: "maintenance", // ne déclenche pas de mission, juste une observation
    reason: t.detail,
  };
}
Résultat : toutes les 5 min, Leanna « remarque » par elle-même quelque chose et le consigne. Sans intervention. C'est exactement ce qui donne la sensation d'être vivante.

✅ Amélioration 3 — Vocal toujours actif (« présence vocale »)
Créer server/live/VoicePresence.ts

ts
/**
 * VoicePresence — présence vocale continue de Leanna.
 *
 * Contrairement à /live (session ouverte à la demande par le frontend),
 * ce service maintient une session Gemini Live OUVERTE EN PERMANENCE,
 * en écoute passive (VAD), prête à :
 *   - réagir à un mot d'activation ("Leanna", "Hey Leanna")
 *   - répondre à une question spontanée
 *   - ANNONCER proactivement un événement important (mission terminée,
 *     erreur critique détectée, réflexion de fond avec confiance > 0.7)
 *
 * Le service ne fait RIEN d'autre que de la voix : il ne déclenche aucune
 * action à effet de bord. Les actions passent toujours par ToolRegistry →
 * PermissionPolicy → AutonomyPolicy, comme le reste du runtime.
 *
 * Le micro reste local (aucun enregistrement disque) : seuls les chunks
 * audio temps réel transitent vers Gemini, exactement comme /live.
 */
import { WebSocket } from "ws";
import { GoogleGenAI } from "@google/genai";
import { createLogger } from "../utils/logger.js";

const log = createLogger("VoicePresence");

export interface VoicePresenceOptions {
  /** Phrase déclencheuse (regex insensible à la casse). Défaut /leanna|hey leanna/i */
  wakePattern?: RegExp;
  /** Modèle Gemini Live. Défaut identique à /live. */
  model?: string;
  /** Voix Gemini (Aoede, Puck…). */
  voiceName?: string;
  /** Si vrai, Leanna peut parler SANS mot d'activation pour les events critiques. */
  allowProactiveSpeech?: boolean;
  /** Seuil de confiance au-dessus duquel un event proactif est annoncé. */
  proactiveThreshold?: number;
}

export class VoicePresence {
  private session: any = null;
  private clientWs: WebSocket | null = null;
  private listening = false;
  private opts: Required<VoicePresenceOptions>;

  constructor(
    private readonly createGeminiClient: () => GoogleGenAI,
    private readonly getProfile: () => { aiName?: string; aiVoice?: string },
    options: VoicePresenceOptions = {},
  ) {
    this.opts = {
      wakePattern: options.wakePattern ?? /\b(leanna|hey leanna|léanna)\b/i,
      model: options.model ?? "gemini-3.8-flash-live",
      voiceName: options.voiceName ?? "Aoede",
      allowProactiveSpeech: options.allowProactiveSpeech ?? true,
      proactiveThreshold: options.proactiveThreshold ?? 0.7,
    };
  }

  /**
   * Démarre une session Live « passive » : le micro du navigateur (via le
   * frontend Electron) est redirigé vers nous, mais on ne répond QUE si le
   * wake word est détecté OU si on nous demande explicitement de parler.
   */
  async start(): Promise<void> {
    if (this.session) return;
    try {
      const ai = this.createGeminiClient();
      const profile = this.getProfile();
      this.session = await (ai as any).live.connect({
        model: this.opts.model,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: profile.aiVoice ?? this.opts.voiceName },
            },
          },
          systemInstruction: {
            parts: [{
              text:
                `Tu es ${profile.aiName ?? "Leanna"}, une présence vocale continue. ` +
                `Tu écoutes en permanence mais tu ne réponds QUE si on t'appelle ` +
                `par ton nom ou si on te pose directement une question. ` +
                `Sinon tu restes silencieuse. Quand tu réponds, sois brève (1-3 phrases).`,
            }],
          },
        },
      });
      this.listening = true;
      log.info("Présence vocale active — Leanna écoute en continu");
    } catch (e) {
      log.error(`Échec démarrage présence vocale: ${(e as Error).message}`);
      this.session = null;
    }
  }

  stop(): void {
    this.listening = false;
    try { this.session?.close?.(); } catch { /* ignore */ }
    this.session = null;
  }

  /** Point d'entrée : le frontend pousse les chunks audio captés en continu. */
  feedAudio(base64Pcm: string): void {
    if (!this.listening || !this.session) return;
    try {
      this.session.sendRealtimeInput?.({
        mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: base64Pcm }],
      });
    } catch { /* session peut être en reconnexion */ }
  }

  /**
   * Annonce proactive. À appeler depuis LeannaCore quand un événement
   * important se produit (mission terminée, dead-letter, erreur critique).
   * Respecte le seuil de confiance : les événements faibles sont ignorés.
   */
  async announce(text: string, confidence = 1.0): Promise<void> {
    if (!this.opts.allowProactiveSpeech) return;
    if (confidence < this.opts.proactiveThreshold) return;
    if (!this.session) return;
    try {
      await this.session.sendClientContent?.({
        turns: [{ role: "user", parts: [{ text: `[EVENT INTERNE] ${text}. Annonce-le brièvement.` }] }],
        turnComplete: true,
      });
    } catch (e) {
      log.warn(`Annonce proactive échouée: ${(e as Error).message}`);
    }
  }
}
Câblage dans server.ts
ts
// Dans startServer(), après attachLiveWebSocket(...) :
import { VoicePresence } from "./server/live/VoicePresence.js";

const voicePresence = new VoicePresence(
  () => getGeminiAI(),
  () => currentProfile,
  {
    allowProactiveSpeech: process.env.LEANNA_VOICE_PROACTIVE !== "false",
    proactiveThreshold: Number(process.env.LEANNA_VOICE_PROACTIVE_THRESHOLD ?? "0.7"),
  },
);
await voicePresence.start();

// Brancher l'annonce proactive sur les événements autonomy:*
leannaCore.setBroadcaster((msg) => {
  // ... broadcaster existant ...
  if (msg.type === "autonomy_event") {
    if (msg.event === "autonomy:health" && msg.payload?.health === "degraded") {
      voicePresence.announce(`Attention, la santé du runtime est dégradée : ${msg.payload.reason ?? "raison inconnue"}.`, 0.9);
    }
    if (msg.event === "autonomy:taskStateChanged" && msg.payload?.to === "dead_letter") {
      voicePresence.announce(`Une tâche autonome est en échec définitif : ${msg.payload.taskType}.`, 0.85);
    }
  }
});

// Exposer le feed audio via le canal /live : quand une session /live est
// ouverte, on duplique les chunks audio vers VoicePresence (mode "toujours
// écouter" sans avoir à rouvrir une session).
Frontend : capture continue (src/hooks/useLiveAPI.ts — ajout)
ts
// Activer la capture continue : le micro reste ouvert même sans session Live active.
// La session VoicePresence côté serveur reçoit les chunks en flux.
useEffect(() => {
  if (!profile.voiceAlwaysOn) return;
  const media = navigator.mediaDevices.getUserMedia({ audio: true });
  // ... recorder + envoi des chunks vers /live avec { type: "audio_chunk", mode: "presence" }
  // Le backend route vers VoicePresence au lieu de la session Gemini Live principale.
}, [profile.voiceAlwaysOn]);
.env.example
env
# ─── Présence vocale continue ───
# Leanna écoute en permanence et répond au mot d'activation sans ouvrir de session.
LEANNA_VOICE_PRESENCE="true"
# Mot d'activation (regex).
LEANNA_VOICE_WAKE_PATTERN="\\b(leanna|hey leanna|léanna)\\b"
# Annonces proactives d'événements importants (mission terminée, erreur critique).
LEANNA_VOICE_PROACTIVE="true"
LEANNA_VOICE_PROACTIVE_THRESHOLD="0.7"
Résultat : Le micro est toujours ouvert, Leanna écoute en fond, te répond si tu dis « Leanna, … », et parle d'elle-même quand quelque chose d'important se passe.

✅ Amélioration 4 — Heartbeat « vivant » (pensée + respiration)
Modifier HeartbeatService pour ajouter un rythme plus organique :

ts
// Le heartbeat actuel alterne ACTIVE / IDLE / SLEEP.
// On ajoute un mode "DREAMING" : quand en IDLE depuis > 10 min,
// on déclenche un cycle de CuriosityEngine (réflexion de fond).

private async tick(): Promise<void> {
  const idleFor = Date.now() - this.lastActivityAt;
  const state: HeartbeatState =
    idleFor > this.opts.sleepMs         ? "sleeping"
    : idleFor > this.opts.idleAfterMs   ? (this.dreamedRecently ? "idle" : "dreaming")
    : "active";
  // ...
  if (state === "dreaming") {
    this.dreamedRecently = true;
    // Émet un signal de réflexion — CuriosityEngine s'en saisit
    this.bus.emit("curiosity:cycle", { type: "curiosity:cycle", timestamp: Date.now() });
  }
  this.emit("autonomy:heartbeat", { state, reason });
}
🎯 Récapitulatif des fichiers à modifier / créer
Fichier	Action	Impact
.env.example	Modifs	Défauts : auto, vocal continu, seuils
server.ts	Modifs	Fallback auto, branche VoicePresence, CuriosityEngine
server/mission/AutonomyPolicy.ts	Modifs	Auto-approbation ciblée (hors dangerous)
server/autonomy/CuriosityEngine.ts	Créer	Pensées de fond
server/autonomy/PerceptionEngine.ts	Modifs	Traiter curiosity:thought
server/autonomy/HeartbeatService.ts	Modifs	État dreaming
server/autonomy/LeannaCore.ts	Modifs	Démarrer CuriosityEngine, relayer événements vocaux
server/live/VoicePresence.ts	Créer	Écoute continue + annonces
src/hooks/useLiveAPI.ts	Modifs	Capture micro continue
🔐 Garde-fous préservés (impératif)
Aucune de ces améliorations ne contourne :

PermissionPolicy (mode enforce reste obligatoire)

DryRunController (LEANNA_DRY_RUN=true continue d'intercepter tout)

Le sandbox .Leanna/sandbox

AutonomyPolicy : dangerous reste humain-par-défaut, même en auto

JevSafetyGate et LedgerGuard

En clair : Leanna devient vivante, pas incontrôlée.

🚀 Activation (3 lignes)
bash
# .env
LEANNA_AUTONOMY_MODE="auto"
LEANNA_VOICE_PRESENCE="true"
LEANNA_VOICE_PROACTIVE="true"
Puis relance npm run dev : dans les 5 minutes, Leanna commencera à « remarquer » des choses seule et te les dira à voix haute si c'est important.