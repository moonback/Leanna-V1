/**
 * Tests — Garde fail-fast des capabilities fantômes (capabilityAudit)
 *
 * Vérifie que :
 *   - le registre statique réel est cohérent (aucune capability fantôme),
 *     ce qui double la garantie de roleCapabilities.test.ts côté runtime ;
 *   - une vue d'outils enregistrés incomplète fait remonter une capability
 *     "not_registered" ;
 *   - enforceCapabilities respecte la sémantique off/warn/strict ;
 *   - capabilityEnforcementFromEnv lit l'environnement comme l'audit d'attribution.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  auditAgentCapabilities,
  enforceCapabilities,
  PhantomCapabilityError,
  capabilityEnforcementFromEnv,
  type RegisteredToolsView,
} from "./capabilityAudit.js";
import { EXECUTABLE_AGENT_TOOLS } from "./AgentExecutor.js";

// Vue minimale d'outils enregistrés à partir d'une liste de noms.
function view(names: string[]): RegisteredToolsView {
  return { tools: { getDeclarations: () => names.map((name) => ({ name })) } };
}

describe("auditAgentCapabilities — cohérence du registre réel", () => {
  it("le registre statique ne déclare aucune capability fantôme (sans vue d'outils)", () => {
    const report = auditAgentCapabilities();
    assert.deepEqual(
      report.phantoms,
      [],
      `Fantômes inattendus : ${report.phantoms
        .map((p) => `${p.role}→${p.tool} (${p.reason})`)
        .join(", ")}`
    );
    assert.ok(report.totalCapabilities > 0);
    assert.ok(report.totalRoles > 0);
  });

  it("détecte un outil exécutable mais non enregistré comme fantôme not_registered", () => {
    // On fournit une vue vide : tous les outils exécutables déclarés par les
    // rôles deviennent "not_registered" (aucun n'est enregistré).
    const report = auditAgentCapabilities(view([]));
    assert.ok(report.phantoms.length > 0, "Une vue vide doit produire des fantômes");
    assert.ok(
      report.phantoms.every((p) => p.reason === "not_registered"),
      "Avec une vue vide, les fantômes sont tous not_registered (les capabilities du registre sont toutes dans l'allowlist)"
    );
  });

  it("ne remonte aucun fantôme si tous les outils exécutables sont enregistrés", () => {
    // Enregistrer exactement l'allowlist couvre toutes les capabilities valides.
    const report = auditAgentCapabilities(view([...EXECUTABLE_AGENT_TOOLS]));
    assert.deepEqual(report.phantoms, []);
  });
});

describe("enforceCapabilities — politique d'application", () => {
  it("mode warn : ne lève pas même avec une vue incomplète", () => {
    const result = enforceCapabilities(view([]), "warn");
    assert.equal(result.violated, true);
  });

  it("mode strict : lève PhantomCapabilityError si fantôme", () => {
    assert.throws(
      () => enforceCapabilities(view([]), "strict"),
      (err: unknown) => err instanceof PhantomCapabilityError
    );
  });

  it("mode strict : ne lève pas si tout est cohérent", () => {
    const result = enforceCapabilities(view([...EXECUTABLE_AGENT_TOOLS]), "strict");
    assert.equal(result.violated, false);
  });

  it("mode off : ne lève pas, rapport quand même produit", () => {
    const result = enforceCapabilities(view([]), "off");
    assert.equal(result.violated, true);
    assert.ok(result.report.totalCapabilities > 0);
  });
});

describe("capabilityEnforcementFromEnv", () => {
  it("défaut = warn", () => {
    assert.equal(capabilityEnforcementFromEnv({} as NodeJS.ProcessEnv), "warn");
  });
  it("strict reconnu", () => {
    assert.equal(
      capabilityEnforcementFromEnv({ Leanna_CAPABILITY_ENFORCEMENT: "strict" } as unknown as NodeJS.ProcessEnv),
      "strict"
    );
  });
  it("valeur inconnue ⇒ warn", () => {
    assert.equal(
      capabilityEnforcementFromEnv({ Leanna_CAPABILITY_ENFORCEMENT: "bogus" } as unknown as NodeJS.ProcessEnv),
      "warn"
    );
  });
});
