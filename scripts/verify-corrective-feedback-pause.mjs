// Diagnostic tool, not part of `npm test`: confirms the corrective-feedback
// pause button actually stops the auto-advance countdown rather than just
// looking like it does. Pausing clears the tracked timeout
// (correctiveFeedbackTimeout in app.js) without hiding the box or
// advancing, so the box should still be showing well past the normal
// INCORRECT_FEEDBACK_MS window; the close button should still be able to
// dismiss it afterward. Run via `npm run verify:pause`.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = 8937;
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

  await page.locator('#start-session-btn').click();
  const incorrectFeedbackMs = await page.evaluate(() => window.__primavista.INCORRECT_FEEDBACK_MS);
  const wrongMidi = await page.evaluate(() => {
    const api = window.__primavista;
    return api.NOTE_RANGE.find((m) => m !== api.session.current.midi);
  });

  console.log('Missing a note on purpose...');
  await page.evaluate((m) => window.__primavista.onNoteOn(m), wrongMidi);
  assert(!(await page.locator('#corrective-feedback').getAttribute('class')).includes('hidden'), 'corrective feedback is showing');

  console.log('Clicking pause...');
  await page.locator('#corrective-feedback-pause').click();
  assert(
    (await page.locator('#corrective-feedback-pause').getAttribute('class')).includes('hidden'),
    'pause button hides itself once clicked',
  );

  console.log(`Waiting ${incorrectFeedbackMs + 500}ms (past the normal auto-advance window)...`);
  await page.waitForTimeout(incorrectFeedbackMs + 500);
  assert(!(await page.locator('#corrective-feedback').getAttribute('class')).includes('hidden'), 'still showing — pause held past the window');
  assert((await page.locator('#stat-attempts').textContent()) === '1 / 25', 'session has not advanced while paused');

  console.log('Clicking close...');
  await page.locator('#corrective-feedback-close').click();
  assert((await page.locator('#corrective-feedback').getAttribute('class')).includes('hidden'), 'closing after a pause hides the box');
  assert((await page.locator('#stat-attempts').textContent()) === '2 / 25', 'closing after a pause advances the session');

  console.log('\nPASS: pause stops the countdown; close still resolves it afterward.');
} catch (err) {
  console.error(`\n${err.message}`);
  exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
process.exit(exitCode);
