const { test, expect } = require('@playwright/test');

test.describe('page load', () => {
  test('renders a grand staff with no console or page errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/index.html');
    await expect(page.locator('#staff svg')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('starts with one attempt already in progress', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#stat-attempts')).toHaveText('1');
    await expect(page.locator('#stat-correct')).toHaveText('0');
    await expect(page.locator('#stat-accuracy')).toHaveText('0%');
    await expect(page.locator('#stat-avg-time')).toHaveText('—');
  });
});

test.describe('pitch range (SPEC.md v2: A0-C7)', () => {
  test('spans A0 to C7 and contains only natural notes', async ({ page }) => {
    await page.goto('/index.html');
    const { range, min, max } = await page.evaluate(() => {
      const api = window.__primavista;
      return { range: api.NOTE_RANGE, min: api.MIN_MIDI_NOTE, max: api.MAX_MIDI_NOTE };
    });

    expect(min).toBe(21); // A0
    expect(max).toBe(96); // C7
    expect(Math.min(...range)).toBe(21);
    expect(Math.max(...range)).toBe(96);

    const allNatural = await page.evaluate(
      (r) => r.every((midi) => window.__primavista.isNaturalMidiNote(midi)),
      range,
    );
    expect(allNatural).toBe(true);
  });

  test('midiToVexKey names A0 and C7 correctly', async ({ page }) => {
    await page.goto('/index.html');
    const a0 = await page.evaluate(() => window.__primavista.midiToVexKey(21));
    const c7 = await page.evaluate(() => window.__primavista.midiToVexKey(96));
    const middleC = await page.evaluate(() => window.__primavista.midiToVexKey(60));
    expect(a0).toBe('a/0');
    expect(c7).toBe('c/7');
    expect(middleC).toBe('c/4');
  });
});

test.describe('clef selection (SPEC.md v2: ambiguity zone)', () => {
  test('forces bass below the ambiguity zone and treble above it', async ({ page }) => {
    await page.goto('/index.html');
    const { low, high } = await page.evaluate(() => {
      const api = window.__primavista;
      return {
        low: api.chooseClef(api.AMBIGUITY_LOW - 1),
        high: api.chooseClef(api.AMBIGUITY_HIGH + 1),
      };
    });
    expect(low).toBe('bass');
    expect(high).toBe('treble');
  });

  test('randomizes between both clefs inside the ambiguity zone', async ({ page }) => {
    await page.goto('/index.html');
    const clefs = await page.evaluate(() => {
      const api = window.__primavista;
      const midpoint = Math.round((api.AMBIGUITY_LOW + api.AMBIGUITY_HIGH) / 2);
      return Array.from({ length: 200 }, () => api.chooseClef(midpoint));
    });
    const trebleCount = clefs.filter((c) => c === 'treble').length;
    // Statistical check on a 50/50 coin flip over 200 trials — wide enough
    // margin to avoid flakiness while still catching a broken/one-sided implementation.
    expect(trebleCount).toBeGreaterThan(60);
    expect(trebleCount).toBeLessThan(140);
  });

  test('renders extreme range notes (A0, C7) without clipping or errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/index.html');

    for (const midi of [21, 96]) {
      await page.evaluate((m) => {
        const api = window.__primavista;
        api.renderStaff(m, api.chooseClef(m));
      }, midi);
      const svgBox = await page.locator('#staff svg').boundingBox();
      expect(svgBox.width).toBeGreaterThan(0);
      expect(svgBox.height).toBeGreaterThan(0);
    }
    expect(errors).toEqual([]);
  });
});

test.describe('core loop', () => {
  test('a correct note-on advances to a new note and updates stats', async ({ page }) => {
    await page.goto('/index.html');
    const targetBefore = await page.evaluate(() => window.__primavista.state.targetMidi);

    await page.evaluate((midi) => window.__primavista.onNoteOn(midi), targetBefore);

    await expect(page.locator('#stat-attempts')).toHaveText('2');
    await expect(page.locator('#stat-correct')).toHaveText('1');
    await expect(page.locator('#stat-avg-time')).not.toHaveText('—');

    const targetAfter = await page.evaluate(() => window.__primavista.state.targetMidi);
    // Range has enough natural notes that back-to-back repeats are excluded by design.
    expect(targetAfter).not.toBe(targetBefore);
  });

  test('an incorrect note-on flashes red and does not advance', async ({ page }) => {
    await page.goto('/index.html');
    const { targetMidi, wrongMidi } = await page.evaluate(() => {
      const api = window.__primavista;
      const correct = api.state.targetMidi;
      const wrong = api.NOTE_RANGE.find((m) => m !== correct);
      return { targetMidi: correct, wrongMidi: wrong };
    });

    await page.evaluate((midi) => window.__primavista.onNoteOn(midi), wrongMidi);

    await expect(page.locator('#flash-overlay')).toHaveClass(/incorrect/);
    await expect(page.locator('#stat-attempts')).toHaveText('1');

    const targetStillSame = await page.evaluate(() => window.__primavista.state.targetMidi);
    expect(targetStillSame).toBe(targetMidi);
  });

  test('a miss before the correct note excludes it from first-try-correct', async ({ page }) => {
    await page.goto('/index.html');
    const { targetMidi, wrongMidi } = await page.evaluate(() => {
      const api = window.__primavista;
      const correct = api.state.targetMidi;
      const wrong = api.NOTE_RANGE.find((m) => m !== correct);
      return { targetMidi: correct, wrongMidi: wrong };
    });

    await page.evaluate((midi) => window.__primavista.onNoteOn(midi), wrongMidi);
    await page.evaluate((midi) => window.__primavista.onNoteOn(midi), targetMidi);

    await expect(page.locator('#stat-attempts')).toHaveText('2');
    await expect(page.locator('#stat-correct')).toHaveText('0');
  });
});

test.describe('MIDI access states', () => {
  test('shows an access-denied status when permission is not granted', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#midi-status')).toContainText('denied');
  });

  test('shows a no-device status when permission is granted but no device is connected', async ({ browser }) => {
    const context = await browser.newContext();
    await context.grantPermissions(['midi', 'midi-sysex']).catch(() => {});
    const page = await context.newPage();
    await page.goto('/index.html');
    await expect(page.locator('#midi-status')).toContainText('No MIDI input device found');
    await context.close();
  });
});
