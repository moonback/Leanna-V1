/**
 * VoicePresence — présence vocale proactive de Leanna.
 *
 * Contrairement à LiveSocketHandler (/live), qui ouvre une session Gemini Live
 * à la demande quand le frontend se connecte, ce service maintient une session
 * Live légère, dédiée aux ANNONCES PROACTIVES : quand un événement important se
 * produit (santé du runtime dégradée, tâche autonome en échec définitif…),
 * Leanna peut le dire à voix haute d'elle-même.
 *
 * Portée volontairement étroite et sûre :
 *   - Le service ne fait QUE de la voix. Il ne déclenche AUCUNE action à effet
 *     de bord : toute action continue de passer par ToolRegistry →
 *     PermissionPolicy → AutonomyPolicy → DryRun, comme le reste du runtime.
 *   - Il ne capture AUCUN micro ici (pas d'écoute serveur). L'écoute interactive
 *     reste gérée par /live côté frontend. Ce module ne fait que PARLER.
 *   - La session est best-effort : toute erreur de connexion est avalée et ne
 *     doit jamais impacter le runtime. Si Gemini n'est pas joignable, les
 *     annonces sont silencieusement ignorées.
 *
 * Le modèle et la voix réutilisent exactement ceux de LiveSocketHandler
 * (gemini-3.8-live + voix du profil), pour rester cohérents avec /live.
 */

import { GoogleGenAI, Modality } from "@google/genai";
import { createLogger } from "../utils/logger.js";

const log = createLogger("VoicePresence");

export interface VoicePresenceProfile {
  aiName?: string;
  aiVoice?: string;
}

export interface VoicePresenceOptions {
  /** Modèle Gemini Live. Défaut aligné sur LiveSocketHandler. */
  model?: string;
  /** Voix Gemini par défaut si le profil n'en fournit pas. */
  defaultVoice?: string;
  /** Autorise les annonces proactives. Défaut true. */
  allowProactiveSpeech?: boolean;
  /**
   * Seuil de confiance (0..1) au-dessus duquel un événement est annoncé.
   * Les événements de confiance inférieure sont ignorés (pas de bavardage).
   */
  proactiveThreshold?: number;
}

const DEFAULT_MODEL = "gemini-3.8-live";
const DEFAULT_VOICE = "Aoede";

const ratio = (value: number, fallback: number): number =>
  Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;

/** Construit les options depuis l'environnement (flags LEANNA_VOICE_*). */
export const voicePresenceOptionsFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): VoicePresenceOptions => ({
  allowProactiveSpeech: String(env.LEANNA_VOICE_PROACTIVE ?? "true").toLowerCase() !== "false",
  proactiveThreshold: ratio(Number(env.LEANNA_VOICE_PROACTIVE_THRESHOLD), 0.7),
});

/** Vrai si la présence vocale est activée globalement. */
export const voicePresenceEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  String(env.LEANNA_VOICE_PRESENCE ?? "false").toLowerCase() === "true";

export class VoicePresence {
  private session: unknown = null;
  private connecting: Promise<void> | null = null;
  private stopped = false;
  private readonly model: string;
  private readonly defaultVoice: string;
  private readonly allowProactiveSpeech: boolean;
  private readonly proactiveThreshold: number;

  constructor(
    private readonly createGeminiClient: () => GoogleGenAI,
    private readonly getProfile: () => VoicePresenceProfile,
    options: VoicePresenceOptions = {},
  ) {
    this.model = options.model ?? DEFAULT_MODEL;
    this.defaultVoice = options.defaultVoice ?? DEFAULT_VOICE;
    this.allowProactiveSpeech = options.allowProactiveSpeech ?? true;
    this.proactiveThreshold = ratio(options.proactiveThreshold ?? 0.7, 0.7);
  }

  /**
   * Ouvre la session Live d'annonce. Best-effort : en cas d'échec, le service
   * reste inerte (les annonces sont ignorées) sans jamais throw.
   */
  async start(): Promise<void> {
    if (this.stopped || this.session || this.connecting) return;
    this.connecting = this.connect();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async connect(): Promise<void> {
    try {
      const profile = this.getProfile();
      const voiceName = profile.aiVoice || this.defaultVoice;
      const aiName = profile.aiName || "Leanna";
      const ai = this.createGeminiClient();
      // L'API Live est faiblement typée côté SDK ; on reste défensif.
      const live = (ai as unknown as { live?: { connect?: (cfg: unknown) => Promise<unknown> } }).live;
      if (!live?.connect) {
        log.warn("SDK Gemini Live indisponible — présence vocale inactive.");
        return;
      }
      this.session = await live.connect({
        model: this.model,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          systemInstruction: {
            parts: [
              {
                text:
                  `Tu es ${aiName}, une présence vocale. Tu n'interviens que pour annoncer ` +
                  `brièvement un événement interne important porté à ta connaissance. ` +
                  `Reste concise (1 à 2 phrases), factuelle et calme. Ne pose pas de question.`,
              },
            ],
          },
        },
        callbacks: {
          // Les annonces sont one-shot ; on ignore le flux retour (audio géré
          // ailleurs). On garde des callbacks vides pour satisfaire le SDK.
          onmessage: () => {},
          onerror: (e: unknown) => log.warn(`Session vocale: ${(e as Error)?.message ?? e}`),
          onclose: () => { this.session = null; },
        },
      });
      log.info(`Présence vocale active (modèle ${this.model}, voix ${voiceName}).`);
    } catch (e) {
      this.session = null;
      log.warn(`Échec démarrage présence vocale: ${(e as Error).message}`);
    }
  }

  /** Ferme la session (best-effort). */
  stop(): void {
    this.stopped = true;
    const session = this.session as { close?: () => void } | null;
    try {
      session?.close?.();
    } catch {
      /* ignore */
    }
    this.session = null;
  }

  /**
   * Annonce proactive d'un événement interne. Respecte le flag d'activation et
   * le seuil de confiance. Best-effort : jamais de throw vers l'appelant.
   *
   * @param text        Message à annoncer (déjà formaté, concis).
   * @param confidence  Confiance 0..1 ; en dessous du seuil, l'annonce est ignorée.
   */
  async announce(text: string, confidence = 1.0): Promise<void> {
    if (!this.allowProactiveSpeech) return;
    if (this.stopped) return;
    if (confidence < this.proactiveThreshold) return;
    const message = text?.trim();
    if (!message) return;

    // Connexion paresseuse : si la session n'est pas prête, on tente de l'ouvrir.
    if (!this.session) {
      await this.start();
      if (!this.session) return; // toujours indisponible → on abandonne en silence
    }

    const session = this.session as {
      sendClientContent?: (input: unknown) => void | Promise<unknown>;
    };
    try {
      await session.sendClientContent?.({
        turns: [
          {
            role: "user",
            parts: [{ text: `[ÉVÉNEMENT INTERNE] ${message}. Annonce-le brièvement.` }],
          },
        ],
        turnComplete: true,
      });
    } catch (e) {
      log.warn(`Annonce proactive échouée: ${(e as Error).message}`);
    }
  }
}
