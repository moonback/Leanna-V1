/**
 * ImageGeneration Skill — Génération d'images à la demande par Leanna.
 *
 * Leanna décrit une image en langage naturel et cet outil la génère via
 * l'API OpenRouter (modèle Gemini image par défaut), l'enregistre dans le
 * sandbox (dossier `generated-images/`) puis renvoie une image Markdown en
 * data-URI que Leanna doit insérer telle quelle dans sa réponse afin qu'elle
 * s'affiche directement dans le panneau de chat.
 *
 * Permissions : `network` (appel OpenRouter) + `write` (écriture sandbox).
 */

import fs from "fs";
import path from "path";
import { Skill, validateArgs } from "./base.js";
import { z } from "zod";
import { generateImage } from "../utils/imageGeneration.js";
import { resolveSandboxWriteTarget } from "./codebaseHelpers.js";
import { markFileModified } from "../utils/sandbox.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("imageGenerationSkill");

// Modèle image par défaut : Gemini via OpenRouter. Surchargable par
// OPENROUTER_IMAGE_MODEL puis par l'argument `model` de l'appel.
const DEFAULT_IMAGE_MODEL =
  process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-image";

const ALLOWED_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;

// Extension déduite du mediaType renvoyé par l'API.
function extensionFromMediaType(mediaType: string): string {
  switch (mediaType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}

function slugFromPrompt(prompt: string): string {
  return (
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u024F]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "image"
  );
}

const generateImageSchema = z.object({
  prompt: z
    .string()
    .min(3, "Le prompt doit décrire l'image en au moins quelques mots.")
    .max(4000, "Le prompt est trop long (max 4000 caractères)."),
  model: z.string().trim().min(1).optional(),
  style: z.string().trim().min(1).max(200).optional(),
  aspectRatio: z.enum(ALLOWED_ASPECT_RATIOS).optional(),
});

export const imageGenerationSkill: Skill = {
  name: "imageGeneration",

  permissions: ["network", "write"],

  inputSchemas: {
    generate_image: generateImageSchema,
  },

  declarations: [
    {
      name: "generate_image",
      description: [
        "🎨 Génère une image à partir d'une description en langage naturel (OpenRouter / Gemini).",
        "Utilise cet outil dès que l'utilisateur demande de créer, dessiner, générer ou illustrer une image.",
        "L'image est enregistrée automatiquement dans le sandbox (dossier `generated-images/`)",
        "ET affichée automatiquement dans le panneau de chat — tu n'as RIEN à recopier.",
        "",
        "Après l'appel, réponds simplement en une phrase courte (ex: « Voici l'image demandée »).",
        "N'inclus PAS de balise Markdown d'image ni de données base64 dans ta réponse : l'affichage est déjà géré.",
        "",
        "Rédige un `prompt` riche et précis (sujet, cadrage, style, ambiance, couleurs, éclairage).",
        "Le prompt fonctionne mieux en anglais.",
      ].join("\n"),
      permissions: ["network", "write"],
      parameters: {
        type: "OBJECT",
        properties: {
          prompt: {
            type: "STRING",
            description:
              "Description détaillée de l'image à générer (sujet, style, cadrage, ambiance, couleurs). De préférence en anglais.",
          },
          model: {
            type: "STRING",
            description: `Modèle OpenRouter optionnel. Par défaut: ${DEFAULT_IMAGE_MODEL}.`,
          },
          style: {
            type: "STRING",
            description:
              "Style visuel optionnel (ex: 'photorealistic', 'watercolor', 'flat vector illustration', '3D render', 'anime').",
          },
          aspectRatio: {
            type: "STRING",
            description:
              "Ratio d'aspect optionnel parmi: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3. Par défaut: 1:1.",
          },
        },
        required: ["prompt"],
      },
    },
  ],

  handleToolCall: async (name: string, args: any, context?: any) => {
    if (name !== "generate_image") {
      return { error: `Outil inconnu: ${name}` };
    }

    // ── Validation des arguments ──────────────────────────────────────────────
    let validated: z.infer<typeof generateImageSchema>;
    try {
      validated = validateArgs(generateImageSchema, args, "generate_image");
    } catch (e: any) {
      return { error: e?.message || "Arguments invalides pour generate_image." };
    }

    const prompt = validated.prompt.trim();
    const model = validated.model || DEFAULT_IMAGE_MODEL;
    const aspectRatio = validated.aspectRatio || "1:1";

    // Feedback temps-réel dans le chat pendant la génération.
    context?.emitToClient?.({ image_generation: "start", prompt });

    // ── Appel du générateur d'images (OpenRouter) ─────────────────────────────
    let result;
    try {
      result = await generateImage(prompt, {
        model,
        style: validated.style,
        aspectRatio,
        quality: "high",
        resolution: "2K",
      });
    } catch (e: any) {
      log.error(`generate_image: échec de l'appel — ${e?.message}`);
      return {
        error: `Échec de la génération de l'image : ${e?.message || "erreur inconnue"}.`,
        hint: "Vérifie la clé OPENROUTER_API_KEY et le modèle image configuré.",
      };
    }

    if (!result) {
      return {
        error:
          "La génération d'image a échoué. Vérifie que OPENROUTER_API_KEY est configurée et que le modèle image est valide.",
      };
    }

    // ── Enregistrement du fichier dans le sandbox ─────────────────────────────
    const ext = extensionFromMediaType(result.mediaType);
    const filename = `${slugFromPrompt(prompt)}-${Date.now()}.${ext}`;
    const relativePath = `generated-images/${filename}`;

    const dataUri = `data:${result.mediaType};base64,${result.imageBase64}`;
    const buffer = Buffer.from(result.imageBase64, "base64");
    const sizeKB = Math.round(buffer.length / 1024);

    const target = resolveSandboxWriteTarget(relativePath);
    let saved = false;

    if (target) {
      try {
        await fs.promises.mkdir(path.dirname(target.sandboxPath), { recursive: true });
        await fs.promises.writeFile(target.sandboxPath, buffer);
        markFileModified(relativePath);
        saved = true;
        log.info(`🖼️ Image générée (${result.model}) → ${relativePath} (${sizeKB}KB)`);
        // Rafraîchir l'arborescence sandbox de l'IDE.
        context?.emitIdeAction?.({ type: "file-changed", path: relativePath });
      } catch (e: any) {
        log.error(`generate_image: écriture sandbox échouée — ${e?.message}`);
      }
    } else {
      log.warn("generate_image: sandbox indisponible — image affichée sans sauvegarde disque.");
    }

    // ── Affichage direct dans le panneau de chat ──────────────────────────────
    // On envoie l'image (data-URI) DIRECTEMENT au client. Le base64 ne transite
    // PAS par le LLM : il serait tronqué par le cap de résultat d'outil
    // (MAX_TOOL_RESULT_CHARS) et casserait le rendu. Le client insère l'image
    // dans le transcript.
    context?.emitToClient?.({
      image_generation: "done",
      saved,
      path: saved ? relativePath : null,
      dataUri,
      alt: prompt.slice(0, 120),
      model: result.model,
      sizeKB,
    });

    // ── Résultat compact renvoyé au LLM (sans base64) ─────────────────────────
    return {
      status: "success",
      saved,
      path: saved ? relativePath : null,
      model: result.model,
      mediaType: result.mediaType,
      sizeKB,
      cost: result.cost,
      message: saved
        ? `Image générée et enregistrée dans ${relativePath}. Elle est déjà affichée dans le chat — réponds juste par une phrase courte, ne recopie aucune donnée d'image.`
        : `Image générée et affichée dans le chat (sandbox inactive, non sauvegardée). Réponds par une phrase courte, ne recopie aucune donnée d'image.`,
    };
  },
};
