// Syntax-checks every JavaScript file in the project (server, browser, tests).
// The browser code has no build step, so this is what catches typos before
// they reach the page.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['server', 'public/js', 'test', 'scripts'];

function* jsFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* jsFiles(path);
    else if (/\.m?js$/.test(entry.name)) yield path;
  }
}

let failed = 0;
let count = 0;
for (const root of ROOTS) {
  for (const file of jsFiles(root)) {
    count++;
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (err) {
      failed++;
      console.error(`✖ ${file}\n${err.stderr.toString().trim()}\n`);
    }
  }
}
console.log(failed ? `${failed} of ${count} files have syntax errors.` : `✔ ${count} files OK`);
process.exit(failed ? 1 : 0);
