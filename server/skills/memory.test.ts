import test from 'node:test';
import assert from 'node:assert/strict';
import { memorySkill } from './memory.js';

test('memorySkill: metadata', () => {
  assert.equal(memorySkill.name, 'memory');
  const declNames = memorySkill.declarations.map((d: any) => d.name);
  assert.ok(declNames.includes('save_memory'));
  assert.ok(declNames.includes('search_memory'));
  assert.ok(declNames.includes('list_memories'));
  assert.ok(declNames.includes('delete_memory'));
});

test('memorySkill: delete_memory est correctement déclaré', () => {
  const del = memorySkill.declarations.find((d: any) => d.name === 'delete_memory');
  assert.ok(del, 'delete_memory doit être déclaré');
  // Le paramètre id est requis
  assert.deepEqual(del.parameters.required, ['id']);
  assert.ok(del.parameters.properties.id, 'delete_memory doit exposer un paramètre id');
  // Un schéma Zod de validation existe pour delete_memory
  assert.ok(memorySkill.inputSchemas?.delete_memory, 'un schéma Zod delete_memory doit exister');
});

test('memorySkill: delete_memory est une opération destructive (write)', () => {
  const perms = memorySkill.toolPermissions?.delete_memory ?? [];
  assert.ok(perms.includes('write'), 'delete_memory doit requérir la permission write');
});

test('memorySkill: delete_memory valide que l’ID est un UUID', () => {
  const schema = memorySkill.inputSchemas!.delete_memory;
  // UUID invalide → rejet
  assert.throws(() => schema.parse({ id: 'pas-un-uuid' }));
  // UUID valide → accepté
  const ok = schema.parse({ id: '123e4567-e89b-12d3-a456-426614174000' });
  assert.equal(ok.id, '123e4567-e89b-12d3-a456-426614174000');
});
