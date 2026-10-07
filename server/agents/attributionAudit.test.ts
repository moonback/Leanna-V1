/**
 * Tests de l'audit d'attribution déterministe (chaîne outil → agent).
 *
 * Couvre :
 *   - Classement d'un outil par chaque branche de la cascade réelle :
 *       explicit (socle sensible) / capability (rôle) / category (heuristique)
 *       / unattributed (→ system)
 *   - Liste actionnable : owner suggéré pour un outil catégorisable non attribué,
 *     et absence de piste pour un outil totalement inconnu
 *   - enforceAttribution : "warn" ne lève pas, "strict" lève UnattributedToolsError
 *   - Invariant : certain + probable + unattributed == totalTools
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  auditToolAttribution,
  enforceAttribution,
  UnattributedToolsError,
  attributionEnforcementFromEnv,
  type ToolRegistryView,
} from "./attributionAudit.js";
import { applyToolRegistryAttribution } from "./toolAgentMapper.js";

// Le socle `SENSITIVE_TOOL_ATTRIBUTION` (dont git_push) n'alimente le cache
// d'attribution explicite que via applyToolRegistryAttribution(), appelée au
// boot. On reproduit cette condition ici pour tester fidèlement la branche
// "explicit" (sans elle, git_push retomberait sur la catégorie "git").
applyToolRegistryAttribution([]);

// ── Helper : vue ToolRegistry minimale à partir d'une liste de noms ──────────

function view(names: string[]): ToolRegistryView {
  return {
    tools: {
      getDeclarations: () => names.map((name) => ({ name })),
    },
  };
}

// Noms choisis pour toucher chaque branche de la cascade réelle :
//  - read_project_file : déclaré comme capability de plusieurs rôles → "capability"
//  - git_push          : socle SENSITIVE_TOOL_ATTRIBUTION → "explicit"
//  - git_status        : non déclaré / non sensible, mais matche keyword "git"
//                         (catégorie version_control) → "category"
//  - zzz_nonsense_widget : aucun match → "unattributed"
const CAPABILITY_TOOL = "read_project_file";
const EXPLICIT_TOOL = "git_push";
const CATEGORY_TOOL = "git_status";
const UNATTRIBUTED_TOOL = "zzz_nonsense_widget";

describe("auditToolAttribution — classement par branche de cascade", () => {
  it("classe une capability de rôle comme attribution certaine", () => {
    const report = auditToolAttribution(view([CAPABILITY_TOOL]));
    assert.equal(report.certain, 1);
    assert.equal(report.probable, 0);
    assert.equal(report.unattributed, 0);
    assert.equal(report.entries[0].source, "capability");
  });

  it("classe un outil sensible comme attribution explicite", () => {
    const report = auditToolAttribution(view([EXPLICIT_TOOL]));
    assert.equal(report.certain, 1);
    assert.equal(report.entries[0].source, "explicit");
  });

  it("classe un outil matché par mot-clé comme attribution probable (catégorie)", () => {
    const report = auditToolAttribution(view([CATEGORY_TOOL]));
    assert.equal(report.probable, 1);
    assert.equal(report.entries[0].source, "category");
  });

  it("classe un outil inconnu comme non attribué et l'ajoute à la liste actionnable", () => {
    const report = auditToolAttribution(view([UNATTRIBUTED_TOOL]));
    assert.equal(report.unattributed, 1);
    assert.equal(report.actionable.length, 1);
    assert.equal(report.actionable[0].tool, UNATTRIBUTED_TOOL);
    // Aucun mot-clé ne matche → aucune piste d'owner.
    assert.equal(report.actionable[0].suggestedOwner, undefined);
  });
});

describe("auditToolAttribution — invariant & liste actionnable", () => {
  it("certain + probable + unattributed == totalTools", () => {
    const report = auditToolAttribution(
      view([CAPABILITY_TOOL, EXPLICIT_TOOL, CATEGORY_TOOL, UNATTRIBUTED_TOOL])
    );
    assert.equal(report.totalTools, 4);
    assert.equal(report.certain + report.probable + report.unattributed, report.totalTools);
  });

  it("ne remonte dans actionable que les outils réellement non attribués", () => {
    const report = auditToolAttribution(
      view([CAPABILITY_TOOL, EXPLICIT_TOOL, CATEGORY_TOOL, UNATTRIBUTED_TOOL])
    );
    assert.equal(report.actionable.length, 1);
    assert.equal(report.actionable[0].tool, UNATTRIBUTED_TOOL);
  });

  it("liste vide ⇒ rapport à zéro, aucune action", () => {
    const report = auditToolAttribution(view([]));
    assert.equal(report.totalTools, 0);
    assert.equal(report.actionable.length, 0);
  });
});

describe("enforceAttribution — politique d'application", () => {
  it("mode warn : ne lève pas même en présence d'outils non attribués", () => {
    const result = enforceAttribution(view([UNATTRIBUTED_TOOL]), "warn");
    assert.equal(result.violated, true);
    assert.equal(result.report.unattributed, 1);
  });

  it("mode strict : lève UnattributedToolsError s'il reste un outil non attribué", () => {
    assert.throws(
      () => enforceAttribution(view([UNATTRIBUTED_TOOL]), "strict"),
      (err: unknown) => {
        assert.ok(err instanceof UnattributedToolsError);
        assert.deepEqual((err as UnattributedToolsError).tools, [UNATTRIBUTED_TOOL]);
        return true;
      }
    );
  });

  it("mode strict : ne lève pas si tout est attribué", () => {
    const result = enforceAttribution(view([CAPABILITY_TOOL, EXPLICIT_TOOL]), "strict");
    assert.equal(result.violated, false);
  });

  it("mode off : ne logge ni ne lève, rapport quand même produit", () => {
    const result = enforceAttribution(view([UNATTRIBUTED_TOOL]), "off");
    assert.equal(result.violated, true);
    assert.equal(result.report.totalTools, 1);
  });
});

describe("attributionEnforcementFromEnv", () => {
  it("défaut = warn", () => {
    assert.equal(attributionEnforcementFromEnv({} as NodeJS.ProcessEnv), "warn");
  });
  it("strict reconnu", () => {
    assert.equal(
      attributionEnforcementFromEnv({ Leanna_ATTRIBUTION_ENFORCEMENT: "strict" } as unknown as NodeJS.ProcessEnv),
      "strict"
    );
  });
  it("valeur inconnue ⇒ warn", () => {
    assert.equal(
      attributionEnforcementFromEnv({ Leanna_ATTRIBUTION_ENFORCEMENT: "bogus" } as unknown as NodeJS.ProcessEnv),
      "warn"
    );
  });
});
