// Validates BACKLOG.md's item numbering (see backlog item #9): "Next
// number" at the top must be greater than the highest numbered item
// currently in the file, and no two items may share a number. Numbers are
// never reused once an item ships and is removed, so gaps are expected in
// two places: between item numbers still in the file (fine), and between
// the highest item still in the file and "Next number" itself — that gap
// grows whenever the highest-numbered item is the one that ships and gets
// removed, since "Next number" must not fall back down to a number
// already used by a since-removed item. Only a "Next number" that's too
// low (would reuse or re-collide with a present item) or duplicate item
// numbers are treated as failures. Run via `npm run check:backlog` (also
// runs automatically before `npm test`, via the `pretest` script).
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
if (nextNumber < highest + 1) {
  console.error(
    `FAIL: BACKLOG.md's "Next number" is ${nextNumber}, but the highest item number is ${highest} ` +
      `(expected at least ${highest + 1}). Fix the "**Next number:**" line at the top of BACKLOG.md.`,
  );
  process.exit(1);
}

console.log(`OK: BACKLOG.md numbering is consistent (highest item ${highest}, next number ${nextNumber}).`);
