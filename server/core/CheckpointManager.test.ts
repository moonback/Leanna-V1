import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CheckpointManager, type FileGateway } from "./CheckpointManager.js";

/** In-memory FileGateway for deterministic tests (no real disk for content). */
function memGateway(initial: Record<string, string> = {}): FileGateway & { store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    exists: (p) => store.has(p),
    read: (p) => {
      const v = store.get(p);
      if (v === undefined) throw new Error(`missing ${p}`);
      return v;
    },
    write: (p, content) => void store.set(p, content),
    remove: (p) => void store.delete(p),
  };
}

function cpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "leanna-cp-"));
}

test("rollback restores modified file content", () => {
  const gw = memGateway({ "a.ts": "original" });
  const mgr = new CheckpointManager({ gateway: gw, dirOverride: cpDir() });

  const cp = mgr.snapshot(["a.ts"]);
  gw.write("a.ts", "modified");
  assert.equal(gw.store.get("a.ts"), "modified");

  mgr.rollback(cp.id);
  assert.equal(gw.store.get("a.ts"), "original");
});

test("rollback deletes a file that did not exist at snapshot time", () => {
  const gw = memGateway({});
  const mgr = new CheckpointManager({ gateway: gw, dirOverride: cpDir() });

  const cp = mgr.snapshot(["new.ts"]); // file absent at snapshot
  gw.write("new.ts", "created during act");
  assert.equal(gw.exists("new.ts"), true);

  mgr.rollback(cp.id);
  assert.equal(gw.exists("new.ts"), false, "the created file is removed on rollback");
});

test("commit makes rollback impossible", () => {
  const gw = memGateway({ "a.ts": "v1" });
  const mgr = new CheckpointManager({ gateway: gw, dirOverride: cpDir() });

  const cp = mgr.snapshot(["a.ts"]);
  gw.write("a.ts", "v2");
  mgr.commit(cp.id);

  assert.throws(() => mgr.rollback(cp.id), /committé/);
  assert.equal(gw.store.get("a.ts"), "v2", "committed change is preserved");
});

test("changedFiles detects modifications and creations against the snapshot", () => {
  const gw = memGateway({ "a.ts": "one", "b.ts": "two" });
  const mgr = new CheckpointManager({ gateway: gw, dirOverride: cpDir() });

  const cp = mgr.snapshot(["a.ts", "b.ts", "c.ts"]);
  assert.deepEqual(mgr.changedFiles(cp.id), []);

  gw.write("a.ts", "one-modified"); // modification
  gw.write("c.ts", "created"); // creation of a file absent at snapshot
  const changed = mgr.changedFiles(cp.id).sort();
  assert.deepEqual(changed, ["a.ts", "c.ts"]);
});

test("rollback is idempotent", () => {
  const gw = memGateway({ "a.ts": "orig" });
  const mgr = new CheckpointManager({ gateway: gw, dirOverride: cpDir() });
  const cp = mgr.snapshot(["a.ts"]);
  gw.write("a.ts", "changed");
  mgr.rollback(cp.id);
  mgr.rollback(cp.id); // second call is a no-op
  assert.equal(gw.store.get("a.ts"), "orig");
});

test("checkpoints persist and hydrate from disk across instances", () => {
  const dir = cpDir();
  const gw = memGateway({ "a.ts": "disk-orig" });
  const mgr1 = new CheckpointManager({ gateway: gw, dirOverride: dir });
  const cp = mgr1.snapshot(["a.ts"], { missionId: "m1", label: "before-edit" });

  // Fresh manager sharing the same gateway hydrates the checkpoint from disk.
  const mgr2 = new CheckpointManager({ gateway: gw, dirOverride: dir });
  assert.ok(mgr2.get(cp.id));
  gw.write("a.ts", "edited");
  mgr2.rollback(cp.id);
  assert.equal(gw.store.get("a.ts"), "disk-orig");

  fs.rmSync(dir, { recursive: true, force: true });
});
