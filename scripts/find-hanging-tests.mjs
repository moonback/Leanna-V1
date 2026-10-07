// Diagnostic: run each server test file in isolation with a timeout.
// Any file that does NOT exit on its own leaves an open handle (timer,
// socket, child process, watcher) that would hang the full `npm test`.
import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TIMEOUT_MS = 20000;

function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collect(full, out);
    else if (entry.endsWith('.test.ts') && !entry.includes('.soak.')) out.push(full);
  }
  return out;
}

const files = collect(join(ROOT, 'server'));
const hanging = [];
const failed = [];

for (const file of files) {
  const rel = file.replace(ROOT + '\\', '').replace(/\\/g, '/');
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', '--test', file],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] }
  );

  const result = await new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve('HANG');
    }, TIMEOUT_MS);
    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(code === 0 ? 'OK' : `FAIL(${code})`);
    });
  });

  if (result === 'HANG') {
    hanging.push(rel);
    console.log(`HANG  ${rel}`);
  } else if (result !== 'OK') {
    failed.push(`${rel} ${result}`);
    console.log(`${result}  ${rel}`);
  } else {
    console.log(`OK    ${rel}`);
  }
}

console.log('\n===== SUMMARY =====');
console.log('Hanging files (leak open handles):');
hanging.forEach((f) => console.log('  ' + f));
console.log('Failing files:');
failed.forEach((f) => console.log('  ' + f));
