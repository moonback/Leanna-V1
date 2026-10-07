import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { setSelfRoot } from './selfRoot.js';
import {
  getSandboxRoot,
  isSandboxActive,
  getSandboxModifiedFiles,
  markFileModified,
  resolveSandboxPath,
  activateSandbox,
  deactivateSandbox,
  getSandboxStatus,
} from './sandbox.js';

// Ensure SELF_ROOT is set before sandbox functions are exercised.
// sandbox.ts reads SELF_ROOT dynamically at call-time, so setting it here
// (before any test runs) is sufficient.
{
  const __filename = fileURLToPath(import.meta.url);
  const __dirname_local = path.dirname(__filename);
  setSelfRoot(path.resolve(__dirname_local, '..', '..'));
}

test('sandbox: state management and path resolution', () => {
  const root = getSandboxRoot();
  assert.ok(root.includes('sandbox'));

  activateSandbox();
  assert.equal(isSandboxActive(), true);

  const sandboxTestPath = resolveSandboxPath('server/test.ts');
  assert.ok(sandboxTestPath);
  fs.mkdirSync(path.dirname(sandboxTestPath), { recursive: true });
  fs.writeFileSync(sandboxTestPath, '// sandbox-only change\n', 'utf-8');
  markFileModified('server/test.ts');
  const modified = getSandboxModifiedFiles();
  assert.ok(modified.includes('server/test.ts'));

  fs.rmSync(sandboxTestPath, { force: true });
  markFileModified('server/test.ts');
  assert.ok(!getSandboxModifiedFiles().includes('server/test.ts'));

  deactivateSandbox();
  assert.equal(isSandboxActive(), false);
  assert.throws(() => markFileModified('server/blocked.ts'), { name: 'SandboxGuardError' });

  const validPath = resolveSandboxPath('server/test.ts');
  assert.ok(validPath !== null);
  assert.ok(validPath.startsWith(root));

  const invalidPath = resolveSandboxPath('../../outside.ts');
  assert.equal(invalidPath, null);

  const status = getSandboxStatus();
  assert.ok('active' in status);
  assert.ok('modifiedCount' in status);
});

// ── Régression : syncDirectory ne doit pas entrer dans dst quand dst ⊂ src ──
//
// Reproduit le bug EPERM :
//   initSandbox() appelle syncDirectory(SELF_ROOT, SELF_ROOT/.Leanna/sandbox)
//   Sans la garde « dst inside src », le walk entre dans .Leanna/sandbox et
//   essaie de copier sandbox → sandbox/.Leanna/sandbox/… → EPERM / récursion.
test('sandbox: initSandbox ne se copie pas récursivement dans le dossier destination', async () => {
  const os = await import('os');
  const { initSandbox, getSandboxRoot } = await import('./sandbox.js');

  // Créer un répertoire temporaire jouant le rôle de SELF_ROOT
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leanna-sandbox-test-'));

  try {
    // Écrire quelques fichiers sources dans la « racine de projet »
    fs.writeFileSync(path.join(tmpRoot, 'package.json'), '{"name":"test"}', 'utf-8');
    fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'src', 'index.ts'), '// test', 'utf-8');

    // Pointer SELF_ROOT vers le dossier temporaire
    setSelfRoot(tmpRoot);

    // initSandbox doit terminer sans erreur même si dst ⊂ src
    let threw = false;
    try {
      await initSandbox();
    } catch (err: any) {
      threw = true;
      assert.fail(`initSandbox a levé une erreur inattendue : ${err.message}`);
    }
    assert.ok(!threw);

    // Le dossier sandbox doit exister
    const sandboxBase = getSandboxRoot();
    assert.ok(fs.existsSync(sandboxBase), 'Le dossier sandbox doit avoir été créé');

    // Les fichiers sources doivent être présents dans le sandbox
    assert.ok(fs.existsSync(path.join(sandboxBase, 'package.json')));
    assert.ok(fs.existsSync(path.join(sandboxBase, 'src', 'index.ts')));

    // Le sandbox ne doit PAS contenir une copie de lui-même (boucle infinie)
    const nestedSandbox = path.join(sandboxBase, '.Leanna', 'sandbox');
    assert.ok(
      !fs.existsSync(nestedSandbox),
      `Le sandbox ne doit pas contenir une copie imbriquée de lui-même : ${nestedSandbox}`
    );
  } finally {
    // Nettoyage
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
