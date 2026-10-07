import test from "node:test";
import assert from "node:assert/strict";
import { DailyBriefing, type DailyBriefingOptions } from "./DailyBriefing.js";

function makeBriefing(overrides: {
  issues?: Array<{ dimension: string; severity: string; message: string; suggestedAction: string; affectedResources: string[] }>;
  global?: number;
  opportunities?: Array<{ kind: string; message: string; suggestedAction: string; value: number; affectedResources: string[] }>;
  profile?: Partial<{ projectName: string; packageManager: string; frameworks: string[]; hasTests: boolean; failing: string[]; completed: number; failed: number }>;
  doctorThrows?: boolean;
} = {}) {
  const options: DailyBriefingOptions = {
    projectDoctor: {
      diagnose: () => {
        if (overrides.doctorThrows) throw new Error("not indexed");
        return { issues: overrides.issues ?? [], scores: {}, global: overrides.global ?? 100, improvementMissions: [], generatedAt: "", summary: "" };
      },
    } as never,
    opportunityEngine: {
      scan: () => ({
        opportunities: (overrides.opportunities ?? []).map((o, i) => ({ ...o, id: `OPP-${i}`, effort: 2 as const, payoff: o.value / 2, signature: `s${i}` })),
        generatedAt: "", summary: "",
      }),
    } as never,
    projectProfile: {
      getProfile: () => ({
        projectId: "p", projectName: overrides.profile?.projectName ?? "my-app", createdAt: "", updatedAt: "",
        detected: { packageManager: overrides.profile?.packageManager ?? "npm", frameworks: overrides.profile?.frameworks ?? ["react"], languages: ["typescript"], commands: {}, hasTests: overrides.profile?.hasTests ?? true, hasTsConfig: true, isGit: true },
        strategies: { effective: [], failing: overrides.profile?.failing ?? [], playbooks: [] },
        knowledge: { totalFacts: 0, byCategory: {}, conventions: [], architecture: [] },
        preferences: {},
        missionStats: { completed: overrides.profile?.completed ?? 0, failed: overrides.profile?.failed ?? 0 },
      }),
    } as never,
  };
  return new DailyBriefing(options);
}

test("buckets health issues by severity (critical / pending / improvement)", () => {
  const r = makeBriefing({
    issues: [
      { dimension: "security", severity: "critical", message: "vuln", suggestedAction: "patch", affectedResources: [] },
      { dimension: "tests", severity: "high", message: "no tests", suggestedAction: "add tests", affectedResources: [] },
      { dimension: "maintainability", severity: "medium", message: "big files", suggestedAction: "split", affectedResources: [] },
    ],
  }).generate();
  assert.equal(r.counts.critical, 1);
  assert.equal(r.counts.pending, 1);
  assert.equal(r.counts.improvement, 1);
});

test("high-value opportunities land in the pending bucket, others in improvements", () => {
  const r = makeBriefing({
    opportunities: [
      { kind: "health", message: "big win", suggestedAction: "do X", value: 90, affectedResources: [] },
      { kind: "optimization", message: "small win", suggestedAction: "do Y", value: 50, affectedResources: [] },
    ],
  }).generate();
  assert.ok(r.items.some((i) => i.severity === "pending" && i.source === "opportunity"));
  assert.ok(r.items.some((i) => i.severity === "improvement" && i.source === "opportunity"));
});

test("recommended missions are capped and ordered critical-first", () => {
  const r = makeBriefing({
    issues: [
      { dimension: "maintainability", severity: "medium", message: "m", suggestedAction: "fix m", affectedResources: [] },
      { dimension: "security", severity: "critical", message: "c", suggestedAction: "fix c", affectedResources: [] },
    ],
  }).generate({ maxMissions: 2 });
  assert.ok(r.recommendedMissions.length <= 2);
  assert.equal(r.recommendedMissions[0].priority, "critical");
});

test("highlights surface stack, missing tests and failing tools from the profile", () => {
  const r = makeBriefing({ profile: { projectName: "svc", hasTests: false, failing: ["flaky"], completed: 3, failed: 1 } }).generate();
  assert.ok(r.highlights.some((h) => /svc|react|npm/.test(h)) || r.projectName === "svc");
  assert.ok(r.highlights.some((h) => /Aucun test/.test(h)));
  assert.ok(r.highlights.some((h) => /flaky/.test(h)));
  assert.ok(r.highlights.some((h) => /3 ✓ \/ 1 ✗/.test(h)));
});

test("summary is a greeting + counts + recommendation digest", () => {
  const r = makeBriefing({
    issues: [{ dimension: "security", severity: "critical", message: "vuln", suggestedAction: "patch deps", affectedResources: [] }],
  }).generate();
  assert.match(r.summary, /Bonjour/);
  assert.match(r.summary, /problème\(s\) critique\(s\)/);
  assert.match(r.summary, /Recommandation/);
  assert.match(r.summary, /patch deps/);
});

test("include_health=false skips the doctor and still composes opportunities", () => {
  const r = makeBriefing({
    issues: [{ dimension: "security", severity: "critical", message: "vuln", suggestedAction: "patch", affectedResources: [] }],
    opportunities: [{ kind: "automation", message: "repeat op", suggestedAction: "create workflow", value: 60, affectedResources: [] }],
  }).generate({ includeHealth: false });
  assert.equal(r.counts.critical, 0, "health skipped → no health criticals");
  assert.ok(r.items.some((i) => i.source === "opportunity"));
  assert.equal(r.healthScore, 0);
});

test("a doctor failure degrades gracefully (no throw)", () => {
  const r = makeBriefing({ doctorThrows: true, opportunities: [{ kind: "optimization", message: "x", suggestedAction: "y", value: 50, affectedResources: [] }] }).generate();
  assert.ok(r.items.length >= 1, "opportunities still compose when the doctor throws");
});

test("deduplicates identical items", () => {
  const r = makeBriefing({
    issues: [
      { dimension: "tests", severity: "high", message: "no tests", suggestedAction: "add tests", affectedResources: [] },
      { dimension: "tests", severity: "high", message: "no tests", suggestedAction: "add tests", affectedResources: [] },
    ],
  }).generate();
  assert.equal(r.items.filter((i) => i.message.includes("no tests")).length, 1);
});

test("a healthy project with nothing to report yields empty buckets", () => {
  const r = makeBriefing().generate();
  assert.equal(r.counts.critical, 0);
  assert.equal(r.counts.pending, 0);
  assert.equal(r.counts.improvement, 0);
  assert.equal(r.recommendedMissions.length, 0);
});
