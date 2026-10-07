/**
 * Tests — Guidage contextuel par phase (phasePrompts)
 *
 * Vérifie que :
 *   - chaque phase outillée produit un bloc non vide et ciblé ;
 *   - une phase inconnue ou absente retourne "" (comportement inchangé) ;
 *   - les blocs restent compacts (budget de contexte) ;
 *   - le bloc verify mentionne la vérification indépendante, et recovery le
 *     statut structuré `blocked` (cohérence avec le contrat de sortie).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildPhaseGuidance, listGuidedPhases } from "./phasePrompts.js";

describe("buildPhaseGuidance — guidage par phase", () => {
  it("produit un bloc non vide pour chaque phase outillée", () => {
    for (const phase of listGuidedPhases()) {
      const block = buildPhaseGuidance(phase);
      assert.ok(block.length > 0, `La phase "${phase}" doit produire un guidage`);
      assert.match(block, /PHASE ACTUELLE/);
    }
  });

  it("retourne une chaîne vide pour une phase absente ou inconnue", () => {
    assert.equal(buildPhaseGuidance(undefined), "");
    assert.equal(buildPhaseGuidance(""), "");
    assert.equal(buildPhaseGuidance("inexistante"), "");
  });

  it("chaque bloc reste compact (≤ 6 lignes) pour préserver le budget de contexte", () => {
    for (const phase of listGuidedPhases()) {
      const lines = buildPhaseGuidance(phase).split("\n");
      assert.ok(lines.length <= 6, `La phase "${phase}" doit tenir en ≤ 6 lignes (${lines.length})`);
    }
  });

  it("le guidage discovery pousse à ne pas sur-explorer", () => {
    assert.match(buildPhaseGuidance("discovery"), /sur-explore|écriture/i);
  });

  it("le guidage verify insiste sur la vérification indépendante", () => {
    assert.match(buildPhaseGuidance("verify"), /verify_file|typecheck|tests|indépendamment/i);
  });

  it("le guidage recovery renvoie au statut structuré blocked", () => {
    assert.match(buildPhaseGuidance("recovery"), /blocked/);
  });

  it("listGuidedPhases couvre les 5 phases de la boucle agentique", () => {
    const phases = listGuidedPhases().sort();
    assert.deepEqual(phases, ["discovery", "plan", "recovery", "verify", "write"]);
  });
});
