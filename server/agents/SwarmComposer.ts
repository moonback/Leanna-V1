/**
 * SwarmComposer — "Dynamic Agent Swarm" (task.md §9, P1).
 *
 * Pas seulement « coder, reviewer, tester » figés : à partir d'un objectif,
 * Leanna COMPOSE dynamiquement l'équipe d'agents spécialisés nécessaire, les
 * ordonne en pipeline, puis DISSOUT l'équipe après la mission.
 *
 *   « Optimise les performances de mon application. »
 *      → 1 performance · 1 architect · 1 coder · 1 tester · 1 reviewer
 *
 * Design (reuse, don't rebuild): the roles, registry and orchestration already
 * exist (STATIC_AGENT_ROLES, DynamicAgentRegistry, AgentOrchestrator). The gap
 * the roadmap names is the *composition intelligence*. This composer is a
 * deterministic selector/orderer over the existing roles — it never invents a
 * role (every chosen role is validated via `hasAgent`) and never calls a model.
 * Teardown only unregisters roles the composition itself created dynamically;
 * static roles are shared and left intact.
 */

import { listAgentRoles, hasAgent } from "./roles.js";
import { dynamicAgentRegistry } from "./DynamicAgentRegistry.js";
import type { AgentRole } from "./types.js";

/** Pipeline stage a role belongs to, used to order the team. */
export type SwarmStage =
  | "research"   // understand / gather context
  | "design"     // architecture / planning
  | "build"      // implement / fix / refactor
  | "verify"     // test
  | "review"     // review / audit
  | "security"   // security audit
  | "optimize"   // performance / a11y / seo
  | "document";  // docs / formatting / translation

/** One member of a composed swarm. */
export interface SwarmMember {
  role: AgentRole;
  stage: SwarmStage;
  /** Why this role was added (keyword / skill / default). */
  rationale: string;
}

export interface TeamComposition {
  objective: string;
  /** Members ordered as the mission pipeline (research → … → document). */
  members: SwarmMember[];
  /** Convenience: ordered role names. */
  pipeline: AgentRole[];
  /** Roles this composition created dynamically (to unregister on dissolve). */
  createdRoles: AgentRole[];
  summary: string;
}

/** A live, disposable team: dissolve() tears down anything this team created. */
export interface SwarmHandle extends TeamComposition {
  dissolve(): { dissolved: AgentRole[] };
}

/** Fixed stage order so a composed team always forms a coherent pipeline. */
const STAGE_ORDER: SwarmStage[] = ["research", "design", "build", "verify", "review", "security", "optimize", "document"];

/** Which stage each known role occupies. */
const ROLE_STAGE: Record<string, SwarmStage> = {
  researcher: "research",
  vision: "research",
  architect: "design",
  planner: "design",
  coder: "build",
  refactor: "build",
  debugger: "build",
  tester: "verify",
  reviewer: "review",
  security: "security",
  performance: "optimize",
  accessibility: "optimize",
  seo: "optimize",
  ui_ux: "optimize",
  writer: "document",
  documentation: "document",
  formatter: "document",
  proofreader: "document",
  translator: "document",
  summarizer: "document",
};

/** Keyword → role triggers (objective text drives dynamic composition). */
const KEYWORD_ROLES: Array<{ re: RegExp; role: AgentRole; why: string }> = [
  { re: /perf|performance|optimi|latency|lenteur|rapide|vitesse|memory|mémoire/i, role: "performance", why: "objectif de performance" },
  { re: /secur|sécur|vuln|auth|xss|injection|csrf|secret/i, role: "security", why: "enjeu de sécurité" },
  { re: /accessib|a11y|wcag|aria/i, role: "accessibility", why: "exigence d'accessibilité" },
  { re: /\bseo\b|référencement|referencement|meta|sitemap/i, role: "seo", why: "objectif SEO" },
  { re: /ui|ux|interface|design|composant|layout|responsive/i, role: "ui_ux", why: "travail d'interface" },
  { re: /refactor|clean|restructur|dette|dedup/i, role: "refactor", why: "refactorisation" },
  { re: /bug|erreur|crash|stacktrace|fix|corrige|répare|repare/i, role: "debugger", why: "diagnostic de bug" },
  { re: /test|coverage|couverture|vitest|jest|spec/i, role: "tester", why: "besoin de tests" },
  { re: /review|revue|audit|qualit/i, role: "reviewer", why: "revue de code" },
  { re: /architect|conception|schéma|schema|module|système|systeme/i, role: "architect", why: "conception/architecture" },
  { re: /doc|readme|guide|documentation/i, role: "documentation", why: "documentation" },
  { re: /trad|translat|i18n|localis/i, role: "translator", why: "traduction/localisation" },
  { re: /recherche|research|analyse|investig|dépendance|dependance/i, role: "researcher", why: "recherche/analyse" },
];

/** Skill-name → role triggers (a plan's skills also inform the team). */
const SKILL_ROLES: Array<{ re: RegExp; role: AgentRole; why: string }> = [
  { re: /write|edit|replace|create|patch|scaffold/i, role: "coder", why: "modifications de code planifiées" },
  { re: /test|vitest|jest/i, role: "tester", why: "exécution de tests planifiée" },
  { re: /security|audit|vuln/i, role: "security", why: "audit de sécurité planifié" },
  { re: /search|grep|read|knowledge|context|impact/i, role: "researcher", why: "collecte de contexte planifiée" },
];

export interface SwarmComposeInput {
  objective: { title: string; description?: string };
  /** Ordered skills the plan intends to run (optional, refines the team). */
  plannedSkills?: string[];
  /** Hard cap on team size (default 6). */
  maxMembers?: number;
}

/**
 * Deterministic swarm composition over the existing agent roles. No model, no
 * side effects beyond (optional) dynamic role registration recorded for teardown.
 */
export class SwarmComposer {
  /** Compose a team for an objective and return a live handle with dissolve(). */
  compose(input: SwarmComposeInput): SwarmHandle {
    const composition = this.plan(input);
    const createdRoles = [...composition.createdRoles];
    return {
      ...composition,
      dissolve: () => {
        const dissolved: AgentRole[] = [];
        for (const role of createdRoles) {
          // Only tear down roles this composition created; never static roles.
          if (dynamicAgentRegistry.hasAgent(role) && dynamicAgentRegistry.unregisterAgent(role)) {
            dissolved.push(role);
          }
        }
        return { dissolved };
      },
    };
  }

  /** Pure planning: select + order the team without any registration. */
  plan(input: SwarmComposeInput): TeamComposition {
    const text = `${input.objective.title} ${input.objective.description ?? ""}`;
    const maxMembers = input.maxMembers ?? 6;
    const available = new Set(listAgentRoles());

    // Selected role → rationale (first reason wins).
    const selected = new Map<AgentRole, string>();
    const want = (role: AgentRole, why: string) => {
      if (!selected.has(role) && (available.has(role) || hasAgent(role))) selected.set(role, why);
    };

    // 1) Always start from understanding and end with verification/review — the
    // backbone of a sound engineering pipeline.
    want("researcher", "comprendre le besoin et le contexte");

    // 2) Objective keywords.
    for (const { re, role, why } of KEYWORD_ROLES) {
      if (re.test(text)) want(role, why);
    }

    // 3) Planned skills.
    for (const skill of input.plannedSkills ?? []) {
      for (const { re, role, why } of SKILL_ROLES) {
        if (re.test(skill)) want(role, why);
      }
    }

    // 4) If some build/change work is implied but no builder picked yet, add coder.
    const hasBuilder = [...selected.keys()].some((r) => ROLE_STAGE[r] === "build");
    const impliesChange = /ajout|add|implement|créer|creer|build|écris|ecris|develop|feature|corrige|fix|refactor|optimi/i.test(text)
      || (input.plannedSkills ?? []).some((s) => /write|edit|replace|create|patch/i.test(s));
    if (!hasBuilder && impliesChange) want("coder", "implémentation nécessaire");

    // 5) If the team changes code, ensure it is verified and reviewed.
    const willBuild = [...selected.keys()].some((r) => ROLE_STAGE[r] === "build");
    if (willBuild) {
      want("tester", "valider les changements par des tests");
      want("reviewer", "revue de qualité des changements");
    }

    // 6) Order by pipeline stage and cap the team size (keeping the backbone).
    const members: SwarmMember[] = [...selected.entries()]
      .map(([role, rationale]) => ({ role, rationale, stage: ROLE_STAGE[role] ?? "build" }))
      .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));

    const capped = this.capTeam(members, maxMembers);

    const composition: TeamComposition = {
      objective: input.objective.title,
      members: capped,
      pipeline: capped.map((m) => m.role),
      createdRoles: [], // static roles are shared; nothing to tear down here
      summary: "",
    };
    composition.summary = buildSummary(composition);
    return composition;
  }

  /**
   * Cap the team while preserving a coherent pipeline: keep the first builder,
   * a verifier and a reviewer if present, then fill by stage order.
   */
  private capTeam(members: SwarmMember[], max: number): SwarmMember[] {
    if (members.length <= max) return members;
    const essential = new Set<SwarmStage>(["build", "verify", "review"]);
    const kept: SwarmMember[] = [];
    // First pass: essentials in stage order.
    for (const m of members) {
      if (essential.has(m.stage) && !kept.find((k) => k.stage === m.stage)) kept.push(m);
    }
    // Second pass: fill remaining slots by stage order.
    for (const m of members) {
      if (kept.length >= max) break;
      if (!kept.includes(m)) kept.push(m);
    }
    return kept
      .slice(0, max)
      .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
  }
}

function buildSummary(c: TeamComposition): string {
  const lines: string[] = [];
  lines.push(`## 🤖 Équipe composée — « ${c.objective} »`);
  lines.push("");
  lines.push(`${c.members.length} agent(s), pipeline :`);
  lines.push("");
  lines.push(c.pipeline.join(" → "));
  lines.push("");
  for (const m of c.members) {
    lines.push(`- **${m.role}** _(${m.stage})_ — ${m.rationale}`);
  }
  lines.push("");
  lines.push(`L'équipe est dissoute à la fin de la mission.`);
  return lines.join("\n");
}

/** Shared singleton, mirroring the other engines. */
export const swarmComposer = new SwarmComposer();
