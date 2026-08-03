// Validates BACKLOG.md's item numbering (see backlog item #9): "Next
// number" at the top must be exactly one more than the highest numbered
// item currently in the file, and no two items may share a number.
// Numbers are never reused once an item ships and is removed, so gaps in
// the sequence are expected — only the running counter and duplicates are
// checked. Run via `npm run check:backlog` (also runs automatically
// before `npm test`, via the `pretest` script).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BACKLOG_PATH = fileURLToPath(new URL('../BACKLOG.md', import.meta.url));

const backlog = await readFile(BACKLOG_PATH, 'utf8');

const nextNumberMatch = backlog.match(/\*\*Next number:\*\*\s*(\d+)/);
if (!nextNumberMatch) {
  console.error('FAIL: BACKLOG.md has no "**Next number:** N" line.');
  process.exit(1);
}
const nextNumber = Number(nextNumberMatch[1]);

const itemNumbers = [...backlog.matchAll(/^## (\d+):/gm)].map((m) => Number(m[1]));

const seen = new Set();
const duplicates = new Set();
for (const n of itemNumbers) {
  if (seen.has(n)) duplicates.add(n);
  seen.add(n);
}
if (duplicates.size > 0) {
  console.error(`FAIL: BACKLOG.md has duplicate item number(s): ${[...duplicates].join(', ')}`);
  process.exit(1);
}

if (itemNumbers.length === 0) {
  console.log(`BACKLOG.md has no numbered items yet; next number is ${nextNumber} (nothing to check it against).`);
  process.exit(0);
}

const highest = Math.max(...itemNumbers);
if (nextNumber !== highest + 1) {
  console.error(
    `FAIL: BACKLOG.md's "Next number" is ${nextNumber}, but the highest item number is ${highest} ` +
      `(expected ${highest + 1}). Fix the "**Next number:**" line at the top of BACKLOG.md.`,
  );
  process.exit(1);
}

console.log(`OK: BACKLOG.md numbering is consistent (highest item ${highest}, next number ${nextNumber}).`);
