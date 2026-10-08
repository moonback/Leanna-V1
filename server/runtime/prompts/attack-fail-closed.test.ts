/**
 * Test d'attaque C3/C4 — Fail-closed.
 *
 * C4 : charger un dossier de prompts dépourvu d'une section critique (safety)
 *      doit interrompre le démarrage (fail-closed), pas démarrer avec une
 *      politique partielle.
 * C3 : il n'existe plus de fallback vers une politique legacy divergente ; le
 *      pipeline normal produit toujours une politique canonique non vide.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SystemPromptBuilder } from "./SystemPromptBuilder.js";

test("C4 — section critique manquante interrompt le démarrage", () => {
  // Dossier temporaire avec un seul .md non critique : base/safety absents.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leanna-prompts-"));
  try {
    fs.writeFileSync(
      path.join(dir, "cosmetic.md"),
      "<!-- scope: full, priority: 100 -->\n# Cosmetic\nContenu non critique.",
      "utf-8",
    );

    const builder = new SystemPromptBuilder();
    assert.throws(
      () => builder.loadTemplates(dir),
      /critique.*(absente|illisible)|fail-closed/i,
      "le démarrage aurait dû échouer fermé en l'absence de section critique",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("C3 — le pipeline canonique produit une politique non vide (pas de fallback legacy)", () => {
  const builder = new SystemPromptBuilder();
  builder.loadTemplates();
  const built = builder.buildFull({ mode: "full", taskType: "coding" });

  assert.ok(built.rules.length > 0, "aucune règle : le build canonique est vide");
  assert.match(built.content, /<policy>/);
  // La politique canonique inclut toujours les garde-fous P0.
  assert.ok(built.rules.some(r => r.priority === 0));
});
