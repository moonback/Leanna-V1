/**
 * Tests du AuthorizationGate — composition unifiée des 4 axes d'autorisation.
 *
 * Couvre :
 *   - mergeDecisions (deny > ask > allow)
 *   - Axe permission : refus sur permission non accordée / undeclared
 *   - Axe per-agent : refus d'un agent hors allowedAgents sur outil à risque
 *   - Axe autonomy : ask (mode ask) / deny (mode suggest) / allow (mode auto)
 *   - Axe sandbox : deny quand la cible d'écriture sort du sandbox
 *   - Ordre / court-circuit : le plus restrictif l'emporte
 *   - Traçabilité : outcomes détaillés par axe
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  AuthorizationGate,
  mergeDecisions,
  type AuthorizationRequest,
  type SandboxTargetChecker,
} from "./AuthorizationGate.js";
import { PermissionPolicy, ALL_PERMISSIONS } from "./PermissionPolicy.js";
import { AutonomyPolicy } from "../mission/AutonomyPolicy.js";
import type { ToolAttribution } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "authgate-"));
}

/** PermissionPolicy ouverte (enforce, toutes permissions accordées). */
function openPolicy(): PermissionPolicy {
  return new PermissionPolicy({ mode: "enforce", granted: [...ALL_PERMISSIONS] });
}

/** AutonomyPolicy dans un mode donné, sans .leannaignore. */
function autonomy(mode: "suggest" | "ask" | "auto"): AutonomyPolicy {
  const root = makeTempRoot();
  const pol = new AutonomyPolicy({ mode, workspaceRoot: root });
  // Déclare des permissions par outil pour que decide() classe correctement
  // les effets de bord (sinon un outil inconnu est traité prudemment).
  pol.setToolPermissions([
    { name: "read_file", permissions: ["read"] },
    { name: "write_file", permissions: ["write"] },
  ]);
  return pol;
}

/** Checker sandbox qui refuse toute cible contenant "escape". */
const fakeSandbox: SandboxTargetChecker = (p: string) => {
  if (p.includes("escape") || p.startsWith("..")) {
    throw new Error("SANDBOX_PATH_ESCAPE");
  }
  return undefined;
};

// ═══════════════════════════════════════════════════════════════════════════
// mergeDecisions
// ═══════════════════════════════════════════════════════════════════════════

describe("mergeDecisions", () => {
  it("deny domine tout", () => {
    assert.equal(mergeDecisions(["allow", "ask", "deny"]), "deny");
  });
  it("ask domine allow", () => {
    assert.equal(mergeDecisions(["allow", "ask", "allow"]), "ask");
  });
  it("allow si aucun autre", () => {
    assert.equal(mergeDecisions(["allow", "allow"]), "allow");
  });
  it("allow sur liste vide", () => {
    assert.equal(mergeDecisions([]), "allow");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Axe 1 — permission runtime
// ═══════════════════════════════════════════════════════════════════════════

describe("AuthorizationGate — axe permission", () => {
  it("autorise un outil dont la permission est accordée", () => {
    const gate = new AuthorizationGate({ permissionPolicy: openPolicy() });
    const v = gate.authorize({ toolName: "read_file", required: ["read"] });
    assert.equal(v.decision, "allow");
  });

  it("refuse quand une permission requise n'est pas accordée", () => {
    const policy = new PermissionPolicy({ mode: "enforce", granted: ["read"] });
    const gate = new AuthorizationGate({ permissionPolicy: policy });
    const v = gate.authorize({ toolName: "write_file", required: ["write"] });
    assert.equal(v.decision, "deny");
    assert.ok(v.outcomes.some((o) => o.axis === "permission" && o.decision === "deny"));
  });

  it("refuse un outil sans permission déclarée (denyUndeclared par défaut)", () => {
    const gate = new AuthorizationGate({ permissionPolicy: openPolicy() });
    const v = gate.authorize({ toolName: "mystery_tool", required: [] });
    assert.equal(v.decision, "deny");
  });

  it("mode off : tout passe (aucun contrôle)", () => {
    const policy = new PermissionPolicy({ mode: "off", granted: [] });
    const gate = new AuthorizationGate({ permissionPolicy: policy });
    const v = gate.authorize({ toolName: "write_file", required: ["write"] });
    assert.equal(v.decision, "allow");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Axe 2 — autorisation par agent
// ═══════════════════════════════════════════════════════════════════════════

describe("AuthorizationGate — axe per-agent", () => {
  const attribution: ToolAttribution = {
    allowedAgents: ["coder"],
    risk: "exec",
  };

  it("refuse un agent hors allowedAgents sur un outil à risque", () => {
    const gate = new AuthorizationGate({ permissionPolicy: openPolicy() });
    const v = gate.authorize({
      toolName: "run_project_command",
      required: ["exec"],
      attribution,
      agentId: "writer",
    });
    assert.equal(v.decision, "deny");
    assert.ok(v.outcomes.some((o) => o.axis === "agent" && o.decision === "deny"));
  });

  it("autorise l'agent listé dans allowedAgents", () => {
    const gate = new AuthorizationGate({ permissionPolicy: openPolicy() });
    const v = gate.authorize({
      toolName: "run_project_command",
      required: ["exec"],
      attribution,
      agentId: "coder",
    });
    assert.equal(v.decision, "allow");
  });

  it("n'applique pas la règle par-agent à un outil en lecture (risque non restreint)", () => {
    const gate = new AuthorizationGate({ permissionPolicy: openPolicy() });
    const v = gate.authorize({
      toolName: "read_file",
      required: ["read"],
      attribution: { allowedAgents: ["coder"], risk: "read" },
      agentId: "writer",
    });
    assert.equal(v.decision, "allow");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Axe 3 — curseur d'autonomie
// ═══════════════════════════════════════════════════════════════════════════

describe("AuthorizationGate — axe autonomy", () => {
  it("mode ask : un outil à effet de bord demande une approbation", () => {
    const gate = new AuthorizationGate({
      permissionPolicy: openPolicy(),
      autonomyPolicy: autonomy("ask"),
    });
    const v = gate.authorize({ toolName: "write_file", required: ["write"] });
    assert.equal(v.decision, "ask");
    assert.ok(v.autonomyVerdict);
  });

  it("mode suggest : un outil à effet de bord est refusé", () => {
    const gate = new AuthorizationGate({
      permissionPolicy: openPolicy(),
      autonomyPolicy: autonomy("suggest"),
    });
    const v = gate.authorize({ toolName: "write_file", required: ["write"] });
    assert.equal(v.decision, "deny");
    assert.ok(v.outcomes.some((o) => o.axis === "autonomy" && o.decision === "deny"));
  });

  it("mode auto : un outil à effet de bord passe", () => {
    const gate = new AuthorizationGate({
      permissionPolicy: openPolicy(),
      autonomyPolicy: autonomy("auto"),
    });
    const v = gate.authorize({ toolName: "write_file", required: ["write"] });
    assert.equal(v.decision, "allow");
  });

  it("une lecture passe même en mode suggest", () => {
    const gate = new AuthorizationGate({
      permissionPolicy: openPolicy(),
      autonomyPolicy: autonomy("suggest"),
    });
    const v = gate.authorize({ toolName: "read_file", required: ["read"] });
    assert.equal(v.decision, "allow");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Axe 4 — cible sandbox
// ═══════════════════════════════════════════════════════════════════════════

describe("AuthorizationGate — axe sandbox", () => {
  it("refuse une écriture dont la cible sort du sandbox", () => {
    const gate = new AuthorizationGate({
      permissionPolicy: openPolicy(),
      sandboxChecker: fakeSandbox,
    });
    const v = gate.authorize({
      toolName: "write_file",
      required: ["write"],
      args: { path: "escape/secret.txt" },
    });
    assert.equal(v.decision, "deny");
    assert.ok(v.outcomes.some((o) => o.axis === "sandbox" && o.decision === "deny"));
  });

  it("autorise une écriture dont la cible reste dans le sandbox", () => {
    const gate = new AuthorizationGate({
      permissionPolicy: openPolicy(),
      sandboxChecker: fakeSandbox,
    });
    const v = gate.authorize({
      toolName: "write_file",
      required: ["write"],
      args: { path: "src/ok.txt" },
    });
    assert.equal(v.decision, "allow");
    assert.ok(v.outcomes.some((o) => o.axis === "sandbox" && o.decision === "allow"));
  });

  it("ne valide pas la cible pour une lecture (le sandbox protège les écritures)", () => {
    const gate = new AuthorizationGate({
      permissionPolicy: openPolicy(),
      sandboxChecker: fakeSandbox,
    });
    const v = gate.authorize({
      toolName: "read_file",
      required: ["read"],
      args: { path: "escape/whatever.txt" },
    });
    // La lecture ne déclenche pas l'axe sandbox → pas de deny sandbox.
    assert.equal(v.decision, "allow");
    assert.ok(!v.outcomes.some((o) => o.axis === "sandbox"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Composition — le plus restrictif l'emporte
// ═══════════════════════════════════════════════════════════════════════════

describe("AuthorizationGate — composition & court-circuit", () => {
  it("un deny permission court-circuite avant l'autonomy", () => {
    const policy = new PermissionPolicy({ mode: "enforce", granted: ["read"] });
    const gate = new AuthorizationGate({
      permissionPolicy: policy,
      autonomyPolicy: autonomy("auto"),
    });
    const v = gate.authorize({ toolName: "write_file", required: ["write"] });
    assert.equal(v.decision, "deny");
    // L'axe autonomy ne doit même pas avoir été évalué.
    assert.ok(!v.outcomes.some((o) => o.axis === "autonomy"));
  });

  it("permission allow + autonomy ask ⇒ ask", () => {
    const gate = new AuthorizationGate({
      permissionPolicy: openPolicy(),
      autonomyPolicy: autonomy("ask"),
      sandboxChecker: fakeSandbox,
    });
    const v = gate.authorize({
      toolName: "write_file",
      required: ["write"],
      args: { path: "src/ok.txt" },
    });
    assert.equal(v.decision, "ask");
  });

  it("expose une trace par axe et l'outil/agent évalués", () => {
    const gate = new AuthorizationGate({ permissionPolicy: openPolicy() });
    const req: AuthorizationRequest = {
      toolName: "read_file",
      required: ["read"],
      agentId: "coder",
    };
    const v = gate.authorize(req);
    assert.equal(v.toolName, "read_file");
    assert.equal(v.agentId, "coder");
    assert.ok(v.outcomes.length >= 1);
    assert.ok(typeof v.reason === "string" && v.reason.length > 0);
  });
});
