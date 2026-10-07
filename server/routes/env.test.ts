import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import { createEnvRouter } from './env.js';

test('env routes: GET / returns grouped sections with masked secrets', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/env', createEnvRouter());

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/env`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.status, 'success');
    assert.ok(Array.isArray(body.sections));
    assert.ok(body.sections.length > 0);

    // Vérifie qu'aucun secret n'est exposé en clair dans la liste générale
    for (const section of body.sections) {
      for (const v of section.vars) {
        if (v.sensitive) {
          assert.equal(v.value, '', `Le secret ${v.key} ne doit pas avoir de valeur en clair dans GET /`);
        }
      }
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('env routes: GET /reveal/:key returns 404 for unknown keys', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/env', createEnvRouter());

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/env/reveal/UNKNOWN_KEY_NEVER_EXISTING_XYZ`);
    assert.equal(res.status, 404);
    const body = (await res.json()) as any;
    assert.equal(body.status, 'error');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('env routes: POST / validates body updates and rejects malformed payload', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/env', createEnvRouter());

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    // 1. Payload vide / invalide
    const badRes = await fetch(`http://127.0.0.1:${port}/api/env`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(badRes.status, 400);

    // 2. Mise à jour de clés inconnues rejetée
    const updateRes = await fetch(`http://127.0.0.1:${port}/api/env`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updates: {
          UNAUTHORIZED_INVENTED_KEY: 'test',
        },
      }),
    });
    assert.equal(updateRes.status, 200);
    const updateBody = (await updateRes.json()) as any;
    assert.equal(updateBody.status, 'success');
    assert.ok(updateBody.rejected.includes('UNAUTHORIZED_INVENTED_KEY'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
