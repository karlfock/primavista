// Diagnostic tool, not part of `npm test`: confirms that interval mode's
// two-note targets can be entered on the on-screen virtual piano one
// pointer/click at a time, since a mouse or a single finger can only ever
// be "down" on one key at once (unlike a real piano, where both notes of a
// physical chord are struck together).
//
// onNoteOn's matching is a pending-notes set with no timing requirement
// (see app.js) - a target resolves once every note in it has been played,
// regardless of order or how far apart in time the note-on events arrive.
// So two sequential virtual-piano clicks already satisfy a chord target;
// this script exercises that path through real click events (the
// automated suite only calls onNoteOn() directly for interval-mode
// matching, and only click-tests the virtual piano in single-note mode -
// this is the one path neither covers). Run via `npm run verify:piano-interval`.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = 8936;
const BASE_URL = `http://localhost:${PORT}`;
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  ok: ${message}`);
}

const server = createServer(async (req, res) => {
  const filePath = path.join(REPO_ROOT, req.url === '/' ? 'index.html' : req.url);
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch();
let exitCode = 0;
try {
  const page = await browser.newPage();
  await page.goto(`${BASE_URL}/`, { waitUntil: 'load' });

  await page.locator('#interval-toggle').check();
  await page.locator('#start-session-btn').click();

  const [low, high] = await page.evaluate(() => window.__primavista.session.current.midis);
  console.log(`Target interval: ${low} + ${high}`);

  console.log('Clicking the lower note first...');
  await page.locator(`.piano-key[data-midi="${low}"]`).click();
  const afterFirstClick = await page.locator('#stat-attempts').textContent();
  assert(afterFirstClick === '1 / 25', `one note down, session hasn't advanced yet (stat-attempts: "${afterFirstClick}")`);

  console.log('Clicking the higher note second...');
  await page.locator(`.piano-key[data-midi="${high}"]`).click();
  const afterSecondClick = await page.locator('#stat-attempts').textContent();
  const correctCount = await page.locator('#stat-correct').textContent();
  assert(afterSecondClick === '2 / 25', `both notes down, session advanced (stat-attempts: "${afterSecondClick}")`);
  assert(correctCount === '1', `resolved as correct on first try (stat-correct: "${correctCount}")`);

  console.log('\nPASS: sequential virtual-piano clicks satisfy an interval-mode chord target.');
} catch (err) {
  console.error(`\n${err.message}`);
  exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
process.exit(exitCode);
