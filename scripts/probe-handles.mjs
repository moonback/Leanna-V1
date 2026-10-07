// Run the two hanging test files individually and report what keeps the
// event loop alive after the tests finish.
import { spawnSync } from 'node:child_process';

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/probe-handles.mjs <test-file>');
  process.exit(1);
}

const inline = `
import test from 'node:test';
const orig = process.exit;
setTimeout(() => {
  // After node:test would normally have finished, dump remaining handles.
  const res = process.getActiveResourcesInfo();
  console.error('ACTIVE_RESOURCES:' + JSON.stringify(res));
  orig(0);
}, 8000).unref();
await import(${JSON.stringify('file://' + target.replace(/\\/g, '/'))});
`;

const r = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', inline], {
  cwd: process.cwd(),
  encoding: 'utf8',
  timeout: 30000,
  env: { ...process.env },
});
console.log('STDERR:\n' + (r.stderr || ''));
