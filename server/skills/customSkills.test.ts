import test from 'node:test';
import assert from 'node:assert/strict';
import {
  customSkillsManagementSkill,
  invalidateCustomSkillsCache,
  scoreCustomSkillRelevance,
  cosineSimilarity,
  hashText,
  type CustomSkillRow,
} from './customSkills.js';

test('customSkillsManagementSkill: metadata and cache invalidation', () => {
  assert.equal(customSkillsManagementSkill.name, 'custom_skills_management');
  const declNames = customSkillsManagementSkill.declarations.map((d: any) => d.name);
  assert.ok(declNames.includes('list_custom_skills'));
  assert.ok(declNames.includes('create_custom_skill'));

  assert.doesNotThrow(() => {
    invalidateCustomSkillsCache();
  });
});

// ── Scoring de pertinence des custom skills ───────────────────────────────────

function makeSkill(partial: Partial<CustomSkillRow>): CustomSkillRow {
  return {
    id: 'id', name: 'x', description: '', parameters: [], instruction: '',
    category: '', enabled: true, icon: '', created_at: '', updated_at: '',
    ...partial,
  };
}

test('scoreCustomSkillRelevance: name match scores highest', () => {
  const skill = makeSkill({ name: 'deploy_vercel', description: 'autre chose' });
  const matchName = scoreCustomSkillRelevance(skill, 'je veux deploy mon app');
  const noMatch = scoreCustomSkillRelevance(skill, 'écrire un poème');
  assert.ok(matchName > 0, 'un match sur le nom doit scorer > 0');
  assert.equal(noMatch, 0, 'aucun terme commun -> score 0');
});

test('scoreCustomSkillRelevance: weighting name > description', () => {
  const nameHit = makeSkill({ name: 'facture', description: 'xxxx' });
  const descHit = makeSkill({ name: 'xxxx', description: 'génère une facture' });
  const q = 'créer une facture';
  assert.ok(
    scoreCustomSkillRelevance(nameHit, q) > scoreCustomSkillRelevance(descHit, q),
    'une correspondance sur le nom doit peser plus que sur la description',
  );
});

test('scoreCustomSkillRelevance: ignores accents and short words', () => {
  const skill = makeSkill({ name: 'resume', description: 'génère un résumé' });
  // "résumé" (avec accents) doit matcher "resume" après normalisation.
  assert.ok(scoreCustomSkillRelevance(skill, 'fais un résumé') > 0);
  // Mots < 3 chars ignorés : "un" ne crée pas de match parasite.
  const onlyShort = makeSkill({ name: 'ab', description: 'de la' });
  assert.equal(scoreCustomSkillRelevance(onlyShort, 'un de la'), 0);
});

test('scoreCustomSkillRelevance: empty query scores 0', () => {
  const skill = makeSkill({ name: 'anything', description: 'desc' });
  assert.equal(scoreCustomSkillRelevance(skill, ''), 0);
});

test('scoreCustomSkillRelevance: parameters and category contribute', () => {
  const skill = makeSkill({
    name: 'tool', category: 'finance',
    parameters: [{ name: 'invoice_id', type: 'STRING', description: 'identifiant', required: true }],
  });
  assert.ok(scoreCustomSkillRelevance(skill, 'finance invoice') > 0);
});

// ── Helpers du scoring sémantique ─────────────────────────────────────────────

test('cosineSimilarity: identical vectors = 1, orthogonal = 0', () => {
  assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  // Colinéaires de normes différentes → ~1.
  assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [2, 4, 6]) - 1) < 1e-9);
});

test('cosineSimilarity: mismatched/empty vectors = 0', () => {
  assert.equal(cosineSimilarity([1, 2, 3], [1, 2]), 0);
  assert.equal(cosineSimilarity([], []), 0);
  assert.equal(cosineSimilarity([0, 0], [0, 0]), 0);
});

test('hashText: deterministic and content-sensitive', () => {
  assert.equal(hashText('abc'), hashText('abc'));
  assert.notEqual(hashText('abc'), hashText('abd'));
  assert.equal(typeof hashText('anything'), 'string');
});
