// Manual visual smoke check: captures the app's key screens to screenshots/
// (gitignored) for eyeballing during development. Run via `npm run screenshot`.
// This does not assert anything — see tests/app.spec.js for the real checks.
//
// Serves the app with a tiny inline static server rather than spawning
// `serve`/npx, so there's no child-process tree left behind to clean up.
import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = 8935;
const BASE_URL = `http://localhost:${PORT}`;
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = path.join(REPO_ROOT, 'screenshots');

const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

await mkdir(OUT_DIR, { recursive: true });

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
const page = await browser.newPage();
await page.goto(`${BASE_URL}/`, { waitUntil: 'load' });
await page.waitForTimeout(300);

await page.screenshot({ path: path.join(OUT_DIR, '01-note.png') });

const wrongMidi = await page.evaluate(() => {
  const api = window.__primavista;
  const correct = api.session.current.midi;
  return api.NOTE_RANGE.find((m) => m !== correct);
});
await page.evaluate((m) => window.__primavista.onNoteOn(m), wrongMidi);
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(OUT_DIR, '02-incorrect-feedback.png') });

// Play through the rest of the session correctly to reach the summary screen.
for (let i = 0; i < 60; i++) {
  const finished = await page.evaluate(() => window.__primavista.session.finished);
  if (finished) break;
  const awaiting = await page.evaluate(() => window.__primavista.session.awaitingAdvance);
  if (awaiting) {
    const feedbackMs = await page.evaluate(() => window.__primavista.INCORRECT_FEEDBACK_MS);
    await page.waitForTimeout(feedbackMs);
    continue;
  }
  const current = await page.evaluate(() => window.__primavista.session.current.midi);
  await page.evaluate((m) => window.__primavista.onNoteOn(m), current);
}
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(OUT_DIR, '03-summary.png') });

await browser.close();
server.close();
console.log(`Screenshots written to ${OUT_DIR}`);
process.exit(0);
