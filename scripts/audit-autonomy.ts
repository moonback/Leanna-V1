/**
 * Diagnostic d'autonomie (temporaire) — mesure l'état réel de la chaîne
 * outil → agent au boot, sans démarrer le serveur HTTP complet.
 *
 * Enregistre exactement le même jeu de skills que server.ts, puis lance les
 * deux audits (attribution + capabilities) en mode rapport. Donne le chiffre
 * réel d'outils non attribués / de capabilities fantômes pour prioriser.
 *
 * Usage : npx tsx scripts/audit-autonomy.ts
 */
import { bootstrapRuntimeSync } from "../server/runtime/bootstrap.js";

import { automationSkill } from "../server/skills/automation.js";
import { browserSkill } from "../server/skills/browser.js";
import { codebaseSkill } from "../server/skills/codebase.js";
import { githubSkill } from "../server/skills/github.js";
import { guidelinesSkill } from "../server/skills/guidelines.js";
import { historySkill } from "../server/skills/history.js";
import { knowledgeSkill } from "../server/skills/knowledge.js";
import { listSkill } from "../server/skills/list.js";
import { memorySkill } from "../server/skills/memory.js";
import { reasoningSkill } from "../server/skills/reasoning.js";
import { systemSkill } from "../server/skills/system.js";
import { timeSkill } from "../server/skills/time.js";
import { verifySkill } from "../server/skills/verify.js";
import { securityAuditSkill } from "../server/skills/securityAudit.js";
import { weatherSkill } from "../server/skills/weather.js";
import { projectSkill } from "../server/skills/project.js";
import { agentsSkill } from "../server/skills/agents.js";
import { missionSkill } from "../server/skills/mission.js";
import { aiStudioDirectivesSkill } from "../server/skills/aiStudioDirectives.js";
import { documentLinkerSkill } from "../server/skills/documentLinker.js";
import { documentKnowledgeSkill } from "../server/skills/documentKnowledge.js";
import { richDocumentSkill } from "../server/skills/richDocument.js";
import { imageGenerationSkill } from "../server/skills/imageGeneration.js";
import { graphifySkill } from "../server/skills/graphify.js";
import { hierarchicalMemorySkill } from "../server/skills/hierarchicalMemory.js";
import { telegramSkill } from "../server/skills/telegram.js";

import { auditToolAttribution } from "../server/agents/attributionAudit.js";
import { auditAgentCapabilities } from "../server/agents/capabilityAudit.js";
import {
  applyToolRegistryAttribution,
  applyRuntimeAgentAuthorization,
} from "../server/agents/toolAgentMapper.js";

const { runtime } = bootstrapRuntimeSync({
  skills: [
    automationSkill, browserSkill, codebaseSkill, githubSkill,
    guidelinesSkill, historySkill, knowledgeSkill, listSkill,
    memorySkill, hierarchicalMemorySkill, reasoningSkill, systemSkill, timeSkill,
    verifySkill, securityAuditSkill, weatherSkill, projectSkill, agentsSkill,
    missionSkill, aiStudioDirectivesSkill, documentLinkerSkill,
    documentKnowledgeSkill, richDocumentSkill, imageGenerationSkill, graphifySkill, telegramSkill,
  ],
});

// Laisser le temps à l'init async d'enregistrer tous les outils.
await new Promise((r) => setTimeout(r, 1500));

// Appliquer l'attribution comme au boot réel (sinon le socle sensible n'alimente
// pas le cache explicite et les chiffres seraient faussés).
const defs = runtime.tools.getDefinitions();
applyRuntimeAgentAuthorization(defs);
applyToolRegistryAttribution(defs);

const attr = auditToolAttribution(runtime);
const cap = auditAgentCapabilities(runtime);

console.log("\n═══════════════════════════════════════════════════════════");
console.log("DIAGNOSTIC AUTONOMIE — chaîne outil → agent");
console.log("═══════════════════════════════════════════════════════════");
console.log(`Outils exécutables total        : ${attr.totalTools}`);
console.log(`  • certaine (explicite/capab.) : ${attr.certain}`);
console.log(`  • probable (catégorie)        : ${attr.probable}`);
console.log(`  • NON attribuée (→ system)    : ${attr.unattributed}`);
const pct = attr.totalTools > 0 ? Math.round((attr.certain / attr.totalTools) * 100) : 0;
console.log(`  → attribution certaine        : ${pct}%`);
console.log("\nListe actionnable (non attribués) :");
if (attr.actionable.length === 0) {
  console.log("  (aucun)");
} else {
  for (const e of attr.actionable) {
    const owner = e.suggestedOwner ? `owner suggéré: ${e.suggestedOwner}` : "AUCUNE piste";
    const cat = e.detectedCategory ? ` [cat: ${e.detectedCategory}]` : "";
    console.log(`  - ${e.tool}${cat} → ${owner}`);
  }
}

console.log("\n───────────────────────────────────────────────────────────");
console.log(`Capabilities fantômes            : ${cap.phantoms.length}`);
for (const p of cap.phantoms) {
  console.log(`  - ${p.role} → ${p.tool} (${p.reason})`);
}
console.log("═══════════════════════════════════════════════════════════\n");

process.exit(0);
