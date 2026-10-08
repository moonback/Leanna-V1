import test from 'node:test';
import assert from 'node:assert/strict';
import { utilitiesSkill } from './utilities.js';

test('utilitiesSkill: metadata', () => {
  assert.equal(utilitiesSkill.name, 'utilities');
  const declNames = utilitiesSkill.declarations.map((d: any) => d.name);
  assert.ok(declNames.includes('get_news'));
  assert.ok(declNames.includes('lookup_topic'));
});

test('utilitiesSkill: permissions network only', () => {
  assert.deepEqual(utilitiesSkill.permissions, ['network']);
});

test('utilitiesSkill: lookup_topic rejects an empty query', async () => {
  await assert.rejects(
    async () => utilitiesSkill.handleToolCall('lookup_topic', { query: '' }),
    /Validation échouée/,
  );
});

test('utilitiesSkill: unknown tool returns undefined', async () => {
  const res = await utilitiesSkill.handleToolCall('does_not_exist', {});
  assert.equal(res, undefined);
});
