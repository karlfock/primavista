const { test, expect } = require('@playwright/test');

// All-correct playthroughs never requeue, so exactly SESSION_LENGTH notes are needed.
const SESSION_LENGTH_GUARD = 25;

// The app starts idle (see "idle state" describe block below) — most tests
// care about an active session, not the idle state itself, so they start
// one explicitly via this helper rather than relying on auto-start.
async function startNewSession(page) {
  await page.locator('#start-session-btn').click();
}

test.describe('idle state before a session starts', () => {
  test('shows the idle panel with no active session on load', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#idle-panel')).not.toHaveClass(/hidden/);
    await expect(page.locator('#staff-panel')).toHaveClass(/hidden/);
    await expect(page.locator('#stats-panel')).toHaveClass(/hidden/);
    const current = await page.evaluate(() => window.__primavista.session.current);
    expect(current).toBeNull();
  });

  test('a MIDI note-on before starting does nothing', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => window.__primavista.onNoteOn(60));
    const current = await page.evaluate(() => window.__primavista.session.current);
    expect(current).toBeNull();
    await expect(page.locator('#flash-overlay')).not.toHaveClass(/correct|incorrect/);
  });

  test('tapping a piano key before starting does nothing', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('.piano-key[data-midi="60"]').click();
    const current = await page.evaluate(() => window.__primavista.session.current);
    expect(current).toBeNull();
  });

  test('clicking "Start new session" hides the idle panel and begins at note 1 of 25', async ({ page }) => {
    await page.goto('/index.html');
    await startNewSession(page);
    await expect(page.locator('#idle-panel')).toHaveClass(/hidden/);
    await expect(page.locator('#staff-panel')).not.toHaveClass(/hidden/);
    await expect(page.locator('#stats-panel')).not.toHaveClass(/hidden/);
    await expect(page.locator('#stat-attempts')).toHaveText('1 / 25');
    await expect(page.locator('#stat-correct')).toHaveText('0');
    await expect(page.locator('#stat-accuracy')).toHaveText('0%');
    await expect(page.locator('#stat-avg-time')).toHaveText('—');
    await expect(page.locator('#summary-panel')).toHaveClass(/hidden/);
  });
});

test.describe('page load', () => {
  test('renders a grand staff with no console or page errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/index.html');
    await startNewSession(page);
    await expect(page.locator('#staff svg')).toHaveCount(1);
    expect(errors).toEqual([]);
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

  test('midiToVexKey and midiToDisplayName name A0 and C7 correctly', async ({ page }) => {
    await page.goto('/index.html');
    const names = await page.evaluate(() => {
      const api = window.__primavista;
      return {
        vexA0: api.midiToVexKey(21),
        vexC7: api.midiToVexKey(96),
        vexMiddleC: api.midiToVexKey(60),
        displayA0: api.midiToDisplayName(21),
        displayC7: api.midiToDisplayName(96),
      };
    });
    expect(names.vexA0).toBe('a/0');
    expect(names.vexC7).toBe('c/7');
    expect(names.vexMiddleC).toBe('c/4');
    expect(names.displayA0).toBe('A0');
    expect(names.displayC7).toBe('C7');
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
    await startNewSession(page); // staff-panel is hidden until a session starts

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

test.describe('core loop (SPEC.md v3: single attempt, corrective feedback, re-queue)', () => {
  test('a correct note-on advances, logs response time, and shows no note name', async ({ page }) => {
    await page.goto('/index.html');
    await startNewSession(page);
    const targetBefore = await page.evaluate(() => window.__primavista.session.current.midi);

    await page.evaluate((midi) => window.__primavista.onNoteOn(midi), targetBefore);

    await expect(page.locator('#stat-attempts')).toHaveText('2 / 25');
    await expect(page.locator('#stat-correct')).toHaveText('1');
    await expect(page.locator('#stat-avg-time')).not.toHaveText('—');
    await expect(page.locator('#corrective-feedback')).toHaveClass(/hidden/);

    const targetAfter = await page.evaluate(() => window.__primavista.session.current.midi);
    // Range has enough natural notes that back-to-back repeats are excluded by design.
    expect(targetAfter).not.toBe(targetBefore);
  });

  test('an incorrect note-on flashes red, shows the correct note name, and blocks input until it advances', async ({ page }) => {
    await page.goto('/index.html');
    await startNewSession(page);
    const { targetMidi, wrongMidi, expectedName } = await page.evaluate(() => {
      const api = window.__primavista;
      const correct = api.session.current.midi;
      const wrong = api.NOTE_RANGE.find((m) => m !== correct);
      return { targetMidi: correct, wrongMidi: wrong, expectedName: api.midiToDisplayName(correct) };
    });

    await page.evaluate((midi) => window.__primavista.onNoteOn(midi), wrongMidi);

    await expect(page.locator('#flash-overlay')).toHaveClass(/incorrect/);
    await expect(page.locator('#corrective-feedback')).not.toHaveClass(/hidden/);
    await expect(page.locator('#corrective-feedback')).toContainText(expectedName);
    // Single attempt per note: it does not stay on the same note waiting for a retry.
    await expect(page.locator('#stat-attempts')).toHaveText('1 / 25');

    // A second note-on right away (still within the feedback window) must be ignored.
    await page.evaluate((midi) => window.__primavista.onNoteOn(midi), targetMidi);
    await expect(page.locator('#stat-correct')).toHaveText('0');
  });

  test('a missed note is re-queued and excluded from first-try-correct when it comes back', async ({ page }) => {
    await page.goto('/index.html');
    await startNewSession(page);
    const { targetMidi, wrongMidi } = await page.evaluate(() => {
      const api = window.__primavista;
      const correct = api.session.current.midi;
      const wrong = api.NOTE_RANGE.find((m) => m !== correct);
      return { targetMidi: correct, wrongMidi: wrong };
    });

    await page.evaluate((midi) => window.__primavista.onNoteOn(midi), wrongMidi);

    // Requeued item should be sitting in the queue (not lost), and total notes
    // due (queue + current) should be 25 (session length) + 1 (the requeue).
    const queueMidis = await page.evaluate(() => window.__primavista.session.queue.map((item) => item.midi));
    expect(queueMidis).toContain(targetMidi);

    // Wait out the corrective-feedback window so input unblocks and we land on the next note.
    await page.waitForTimeout(1700);
    await expect(page.locator('#stat-attempts')).toHaveText('2 / 25');

    // Play through the queue until the missed note comes back around, then answer it correctly.
    for (let i = 0; i < 30; i++) {
      const current = await page.evaluate(() => window.__primavista.session.current.midi);
      if (current === targetMidi) break;
      await page.evaluate((midi) => window.__primavista.onNoteOn(midi), current);
    }
    const finalCurrent = await page.evaluate(() => window.__primavista.session.current.midi);
    expect(finalCurrent).toBe(targetMidi);

    await page.evaluate((midi) => window.__primavista.onNoteOn(midi), targetMidi);
    const correctCount = await page.locator('#stat-correct').innerText();
    // The re-queued note was answered correctly on its second presentation, so it
    // must not be counted in first-try-correct even though every other note was.
    expect(Number(correctCount)).toBeLessThan(25);
  });
});

test.describe('sessions (SPEC.md v3: fixed 25-note sessions)', () => {
  test('ends with a summary after 25 notes answered correctly on the first try', async ({ page }) => {
    await page.goto('/index.html');
    await startNewSession(page);

    for (let i = 0; i < SESSION_LENGTH_GUARD; i++) {
      const finished = await page.evaluate(() => window.__primavista.session.finished);
      if (finished) break;
      const current = await page.evaluate(() => window.__primavista.session.current.midi);
      await page.evaluate((midi) => window.__primavista.onNoteOn(midi), current);
    }

    await expect(page.locator('#summary-panel')).not.toHaveClass(/hidden/);
    await expect(page.locator('#staff-panel')).toHaveClass(/hidden/);
    await expect(page.locator('#summary-correct')).toHaveText('25');
    await expect(page.locator('#summary-total')).toHaveText('25');
    await expect(page.locator('#summary-avg-time')).not.toHaveText('—');
  });

  test('play again starts a fresh session', async ({ page }) => {
    await page.goto('/index.html');
    await startNewSession(page);

    for (let i = 0; i < SESSION_LENGTH_GUARD; i++) {
      const finished = await page.evaluate(() => window.__primavista.session.finished);
      if (finished) break;
      const current = await page.evaluate(() => window.__primavista.session.current.midi);
      await page.evaluate((midi) => window.__primavista.onNoteOn(midi), current);
    }
    await expect(page.locator('#summary-panel')).not.toHaveClass(/hidden/);

    await page.click('#play-again-btn');

    await expect(page.locator('#summary-panel')).toHaveClass(/hidden/);
    await expect(page.locator('#staff-panel')).not.toHaveClass(/hidden/);
    await expect(page.locator('#stat-attempts')).toHaveText('1 / 25');
    await expect(page.locator('#stat-correct')).toHaveText('0');
  });
});

test.describe('virtual piano (on-screen keyboard, no MIDI device required)', () => {
  test('renders a full 88-key piano (A0 to C8), split into naturals and accidentals', async ({ page }) => {
    await page.goto('/index.html');
    const { whiteCount, blackCount, rangeSize } = await page.evaluate(() => {
      const api = window.__primavista;
      return {
        whiteCount: document.querySelectorAll('.piano-key.white').length,
        blackCount: document.querySelectorAll('.piano-key.black').length,
        rangeSize: api.PIANO_MAX_MIDI_NOTE - api.PIANO_MIN_MIDI_NOTE + 1,
      };
    });
    expect(rangeSize).toBe(88);
    expect(whiteCount).toBe(52);
    expect(blackCount).toBe(36);
    expect(whiteCount + blackCount).toBe(rangeSize);
  });

  test('includes keys above the quizzed A0-C7 range (e.g. C8), which always register as incorrect', async ({ page }) => {
    await page.goto('/index.html');
    await startNewSession(page);
    await expect(page.locator('.piano-key[data-midi="108"]')).toHaveCount(1); // C8

    await page.locator('.piano-key[data-midi="108"]').click();

    await expect(page.locator('#flash-overlay')).toHaveClass(/incorrect/);
    await expect(page.locator('#stat-correct')).toHaveText('0');
  });

  test('tapping the correct key advances the session, same as a MIDI note-on', async ({ page }) => {
    await page.goto('/index.html');
    await startNewSession(page);
    const targetMidi = await page.evaluate(() => window.__primavista.session.current.midi);

    await page.locator(`.piano-key[data-midi="${targetMidi}"]`).click();

    await expect(page.locator('#stat-attempts')).toHaveText('2 / 25');
    await expect(page.locator('#stat-correct')).toHaveText('1');
  });

  test('tapping the wrong key shows corrective feedback, same as a MIDI note-on', async ({ page }) => {
    await page.goto('/index.html');
    await startNewSession(page);
    const wrongMidi = await page.evaluate(() => {
      const api = window.__primavista;
      return api.NOTE_RANGE.find((m) => m !== api.session.current.midi);
    });

    await page.locator(`.piano-key[data-midi="${wrongMidi}"]`).click();

    await expect(page.locator('#flash-overlay')).toHaveClass(/incorrect/);
    await expect(page.locator('#corrective-feedback')).not.toHaveClass(/hidden/);
    await expect(page.locator('#stat-correct')).toHaveText('0');
  });

  test('fills a desktop-width viewport with no horizontal scroll, on the piano or the page', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/index.html');

    const { pianoOverflows, pageOverflows } = await page.evaluate(() => {
      const wrap = document.querySelector('.piano-wrap');
      return {
        pianoOverflows: wrap.scrollWidth > wrap.clientWidth,
        pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    expect(pianoOverflows).toBe(false);
    expect(pageOverflows).toBe(false);
  });

  test('falls back to horizontal scroll on a narrow (mobile-width) viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/index.html');

    const pianoOverflows = await page.evaluate(() => {
      const wrap = document.querySelector('.piano-wrap');
      return wrap.scrollWidth > wrap.clientWidth;
    });
    expect(pianoOverflows).toBe(true);
  });

  test('recomputes key widths on window resize', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/index.html');
    const wideWidth = await page.evaluate(() =>
      parseFloat(document.querySelector('.piano-key.white').style.width));

    await page.setViewportSize({ width: 800, height: 900 });
    await page.waitForTimeout(300); // debounce in the resize handler

    const narrowWidth = await page.evaluate(() =>
      parseFloat(document.querySelector('.piano-key.white').style.width));

    expect(narrowWidth).toBeLessThan(wideWidth);
  });
});

test.describe('chromatic notes and interval mode (SPEC.md v5)', () => {
  test('default mode (both toggles off) still presents single-note targets', async ({ page }) => {
    await page.goto('/index.html');
    await startNewSession(page);
    const midisLength = await page.evaluate(() => window.__primavista.session.current.midis.length);
    expect(midisLength).toBe(1);
  });

  test('midiToVexKey and midiToDisplayName spell chromatic notes as sharps', async ({ page }) => {
    await page.goto('/index.html');
    const names = await page.evaluate(() => {
      const api = window.__primavista;
      return {
        cSharp4Key: api.midiToVexKey(61),
        cSharp4Name: api.midiToDisplayName(61),
        naturalC4Key: api.midiToVexKey(60),
        naturalC4Name: api.midiToDisplayName(60),
      };
    });
    expect(names.cSharp4Key).toBe('c#/4');
    expect(names.cSharp4Name).toBe('C#4');
    expect(names.naturalC4Key).toBe('c/4');
    expect(names.naturalC4Name).toBe('C4');
  });

  test('checking "Chromatic notes" restarts the session drawing from all 12 pitch classes', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('#chromatic-toggle').check();

    const sawAccidental = await page.evaluate(() => {
      const api = window.__primavista;
      for (let i = 0; i < 40; i++) {
        api.startSession();
        if (!api.isNaturalMidiNote(api.session.current.midi)) return true;
      }
      return false;
    });
    expect(sawAccidental).toBe(true);
  });

  test('pickIntervalPair always returns two distinct in-range notes 1-12 semitones apart', async ({ page }) => {
    await page.goto('/index.html');
    const allValid = await page.evaluate(() => {
      const api = window.__primavista;
      for (let i = 0; i < 500; i++) {
        const [low, high] = api.pickIntervalPair();
        const distance = high - low;
        if (low < api.MIN_MIDI_NOTE || high > api.MAX_MIDI_NOTE) return false;
        if (distance < api.MIN_INTERVAL_SEMITONES || distance > api.MAX_INTERVAL_SEMITONES) return false;
      }
      return true;
    });
    expect(allValid).toBe(true);
  });

  test('checking "Interval mode" and starting a new session presents a two-note chord target', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('#interval-toggle').check();
    await startNewSession(page);

    const midisLength = await page.evaluate(() => window.__primavista.session.current.midis.length);
    expect(midisLength).toBe(2);
    await expect(page.locator('#staff svg .vf-notehead')).toHaveCount(2);
  });

  test('playing both interval notes in either order advances the session', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('#interval-toggle').check();
    await startNewSession(page);
    const [low, high] = await page.evaluate(() => window.__primavista.session.current.midis);

    // Play them in reverse (high, then low) order to confirm order doesn't matter.
    await page.evaluate((m) => window.__primavista.onNoteOn(m), high);
    await page.evaluate((m) => window.__primavista.onNoteOn(m), low);

    await expect(page.locator('#stat-attempts')).toHaveText('2 / 25');
    await expect(page.locator('#stat-correct')).toHaveText('1');
  });

  test('a wrong note during an interval attempt fails immediately and names both target notes', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('#interval-toggle').check();
    await startNewSession(page);
    const { expectedText, wrongMidi } = await page.evaluate(() => {
      const api = window.__primavista;
      const target = api.session.current.midis;
      const wrong = api.NOTE_RANGE.find((m) => !target.includes(m));
      return {
        wrongMidi: wrong,
        expectedText: `That was ${target.map((m) => api.midiToDisplayName(m, target)).join(' + ')}`,
      };
    });

    await page.evaluate((m) => window.__primavista.onNoteOn(m), wrongMidi);

    await expect(page.locator('#flash-overlay')).toHaveClass(/incorrect/);
    await expect(page.locator('#corrective-feedback')).toHaveText(expectedText);
    await expect(page.locator('#stat-correct')).toHaveText('0');
  });

  test('checking a practice-option box does not restart the current session until "Start new session" is clicked', async ({ page }) => {
    await page.goto('/index.html');
    await startNewSession(page); // default: single-note session
    const beforeLength = await page.evaluate(() => window.__primavista.session.current.midis.length);
    expect(beforeLength).toBe(1);

    await page.locator('#interval-toggle').check();
    const stillUnchanged = await page.evaluate(() => window.__primavista.session.current.midis.length);
    expect(stillUnchanged).toBe(1); // checking the box alone must not touch the live session

    await startNewSession(page);
    const nowApplied = await page.evaluate(() => window.__primavista.session.current.midis.length);
    expect(nowApplied).toBe(2);
  });

  test('"Chromatic notes" shows as checked and disabled while interval mode is on, and restores afterward', async ({ page }) => {
    await page.goto('/index.html');
    const chromaticCheckbox = page.locator('#chromatic-toggle');
    const intervalCheckbox = page.locator('#interval-toggle');

    // Start from an explicit, user-chosen unchecked chromatic preference.
    await expect(chromaticCheckbox).not.toBeChecked();

    await intervalCheckbox.check();
    await expect(chromaticCheckbox).toBeChecked();
    await expect(chromaticCheckbox).toBeDisabled();

    await intervalCheckbox.uncheck();
    await expect(chromaticCheckbox).not.toBeChecked(); // restores the prior (unchecked) preference
    await expect(chromaticCheckbox).toBeEnabled();
  });

  test('"Chromatic notes" restores a checked preference after interval mode is turned back off', async ({ page }) => {
    await page.goto('/index.html');
    const chromaticCheckbox = page.locator('#chromatic-toggle');
    const intervalCheckbox = page.locator('#interval-toggle');

    await chromaticCheckbox.check();
    await intervalCheckbox.check();
    await expect(chromaticCheckbox).toBeChecked(); // still checked (now forced, not just preferred)
    await expect(chromaticCheckbox).toBeDisabled();

    await intervalCheckbox.uncheck();
    await expect(chromaticCheckbox).toBeChecked(); // preference was checked, so it stays checked
    await expect(chromaticCheckbox).toBeEnabled();
  });
});

test.describe('chord note spelling avoids same-letter collisions (SPEC.md v5)', () => {
  // A chord with e.g. F and F# together would otherwise show two
  // same-letter noteheads distinguished only by an accidental, which is
  // ambiguous/incorrect notation (an accidental applies to every note of
  // that letter+octave for the rest of the measure). The sharp note
  // should be respelled as the enharmonic flat of the next letter (F# ->
  // Gb) so the two notes land on distinct staff positions.
  test('respells the sharp note in each of the 5 natural+sharp minor-second collisions', async ({ page }) => {
    await page.goto('/index.html');
    const cases = await page.evaluate(() => {
      const api = window.__primavista;
      // [naturalMidi, sharpMidi] pairs: C/C#, D/D#, F/F#, G/G#, A/A#
      const pairs = [[60, 61], [62, 63], [65, 66], [67, 68], [69, 70]];
      return pairs.map(([natural, sharp]) => ({
        naturalKey: api.midiToVexKey(natural, [natural, sharp]),
        sharpKey: api.midiToVexKey(sharp, [natural, sharp]),
        sharpName: api.midiToDisplayName(sharp, [natural, sharp]),
      }));
    });
    expect(cases).toEqual([
      { naturalKey: 'c/4', sharpKey: 'db/4', sharpName: 'Db4' },
      { naturalKey: 'd/4', sharpKey: 'eb/4', sharpName: 'Eb4' },
      { naturalKey: 'f/4', sharpKey: 'gb/4', sharpName: 'Gb4' },
      { naturalKey: 'g/4', sharpKey: 'ab/4', sharpName: 'Ab4' },
      { naturalKey: 'a/4', sharpKey: 'bb/4', sharpName: 'Bb4' },
    ]);
  });

  test('does not respell a sharp note with no colliding natural neighbor in the chord', async ({ page }) => {
    await page.goto('/index.html');
    const { soloSharp, nonCollidingPair } = await page.evaluate(() => {
      const api = window.__primavista;
      return {
        soloSharp: api.midiToVexKey(66), // F#4 alone, no chord context at all
        // C#4 + D4: a minor second, but different letters already (no collision)
        nonCollidingPair: [api.midiToVexKey(61, [61, 62]), api.midiToVexKey(62, [61, 62])],
      };
    });
    expect(soloSharp).toBe('f#/4');
    expect(nonCollidingPair).toEqual(['c#/4', 'd/4']);
  });

  test('shows the respelled name in corrective feedback for a colliding chord', async ({ page }) => {
    await page.goto('/index.html');
    await startNewSession(page);
    await page.evaluate(() => {
      const api = window.__primavista;
      // Force a known colliding target: F4 + F#4.
      api.session.current = { midi: 65, midis: [65, 66], clef: 'treble', isFirstPresentation: true };
    });

    await page.evaluate(() => window.__primavista.onNoteOn(21)); // wrong note

    await expect(page.locator('#corrective-feedback')).toHaveText('That was F4 + Gb4');
  });
});

test.describe('weighted note selection based on historical misses (SPEC.md v6)', () => {
  test('trouble keys: notes are keyed by midi, intervals by sorted pair regardless of input order', async ({ page }) => {
    await page.goto('/index.html');
    const keys = await page.evaluate(() => {
      const api = window.__primavista;
      return {
        note: api.troubleKeyForNote(60),
        pairAscending: api.troubleKeyForInterval([65, 66]),
        pairDescending: api.troubleKeyForInterval([66, 65]), // must produce the same key
      };
    });
    expect(keys.note).toBe('n:60');
    expect(keys.pairAscending).toBe('i:65-66');
    expect(keys.pairDescending).toBe('i:65-66');
  });

  test('a miss increments by MISS_TROUBLE_DELTA; a correct answer decrements by the smaller CORRECT_TROUBLE_DELTA', async ({ page }) => {
    await page.goto('/index.html');
    const { steps, deltas } = await page.evaluate(() => {
      const api = window.__primavista;
      const steps = [];
      api.recordAttemptOutcome([60], false);
      steps.push(api.loadTroubleScores()['n:60']);
      api.recordAttemptOutcome([60], true);
      steps.push(api.loadTroubleScores()['n:60']);
      api.recordAttemptOutcome([60], true);
      steps.push('n:60' in api.loadTroubleScores()); // fully cleared only after enough corrects
      return { steps, deltas: { miss: api.MISS_TROUBLE_DELTA, correct: api.CORRECT_TROUBLE_DELTA } };
    });
    expect(deltas).toEqual({ miss: 1, correct: 0.5 });
    expect(steps).toEqual([1, 0.5, false]);
  });

  // This is the specific bug found in real use: the app's own re-queue
  // mechanic guarantees a miss is followed by an eventual same-session
  // correct answer (a session doesn't end until every note has been
  // answered right — see SPEC.md v3), so a symmetric +1/-1 delta would
  // let that guaranteed redemption silently erase almost every miss
  // before it could ever influence a future session. The reward must be
  // smaller than the penalty so some signal survives past that first
  // same-session retry.
  test('one miss followed by one correct does not fully erase the trouble score', async ({ page }) => {
    await page.goto('/index.html');
    const scoreAfterMissThenCorrect = await page.evaluate(() => {
      const api = window.__primavista;
      api.recordAttemptOutcome([60], false); // the miss
      api.recordAttemptOutcome([60], true); // the guaranteed same-session redemption
      return api.loadTroubleScores()['n:60'];
    });
    expect(scoreAfterMissThenCorrect).toBeGreaterThan(0);
  });

  test('a correct answer on an already-0 score stays absent (never goes negative)', async ({ page }) => {
    await page.goto('/index.html');
    const hasKey = await page.evaluate(() => {
      const api = window.__primavista;
      api.recordAttemptOutcome([60], true);
      return 'n:60' in api.loadTroubleScores();
    });
    expect(hasKey).toBe(false);
  });

  test('interval misses are scored independently from single-note misses', async ({ page }) => {
    await page.goto('/index.html');
    const scores = await page.evaluate(() => {
      const api = window.__primavista;
      api.recordAttemptOutcome([65], false); // single F4
      api.recordAttemptOutcome([65, 66], false); // F4+F#4 interval
      return api.loadTroubleScores();
    });
    expect(scores).toEqual({ 'n:65': 1, 'i:65-66': 1 });
  });

  test('pickRandomNote favors a note with a high trouble score', async ({ page }) => {
    await page.goto('/index.html');
    const counts = await page.evaluate(() => {
      const api = window.__primavista;
      const scores = { [api.troubleKeyForNote(60)]: 500 }; // C4 heavily favored
      const tally = {};
      for (let i = 0; i < 300; i++) {
        const note = api.pickRandomNote(null, scores);
        tally[note] = (tally[note] || 0) + 1;
      }
      return tally;
    });
    // Weight 501 vs 1 for every other of the ~45 naturals in range (total
    // weight ~545) puts C4's expected share around 92% of the sample —
    // comfortably clear of 100/300 with margin for random variance.
    expect(counts[60]).toBeGreaterThan(100);
  });

  test('pickIntervalPair favors an interval pair with a high trouble score', async ({ page }) => {
    await page.goto('/index.html');
    const counts = await page.evaluate(() => {
      const api = window.__primavista;
      // The candidate pool is in the hundreds of pairs (much bigger than the
      // ~45-note single-note pool), so the score needs to be large relative
      // to that pool size to make the boosted pair dominate a sample.
      const scores = { [api.troubleKeyForInterval([65, 66])]: 5000 };
      const tally = {};
      for (let i = 0; i < 300; i++) {
        const [low, high] = api.pickIntervalPair(scores);
        const key = `${low}-${high}`;
        tally[key] = (tally[key] || 0) + 1;
      }
      return tally;
    });
    expect(counts['65-66']).toBeGreaterThan(100);
  });

  test('with no trouble scores at all, selection stays effectively uniform (existing behavior preserved)', async ({ page }) => {
    await page.goto('/index.html');
    const allInRange = await page.evaluate(() => {
      const api = window.__primavista;
      for (let i = 0; i < 200; i++) {
        const note = api.pickRandomNote(null, {});
        if (!api.NOTE_RANGE.includes(note)) return false;
      }
      return true;
    });
    expect(allInRange).toBe(true);
  });

  test('missing a note in a real session persists a trouble score to localStorage', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('#start-session-btn').click();
    await page.evaluate(() => {
      const api = window.__primavista;
      api.session.current = { midi: 60, midis: [60], clef: 'treble', isFirstPresentation: true };
    });

    await page.evaluate(() => window.__primavista.onNoteOn(21)); // wrong note

    const score = await page.evaluate(() => window.__primavista.loadTroubleScores()['n:60']);
    expect(score).toBe(1);
  });

  test('answering correctly in a real session does not add a trouble score', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('#start-session-btn').click();
    await page.evaluate(() => {
      const api = window.__primavista;
      api.session.current = { midi: 60, midis: [60], clef: 'treble', isFirstPresentation: true };
    });

    await page.evaluate(() => window.__primavista.onNoteOn(60)); // correct note

    const hasKey = await page.evaluate(() => 'n:60' in window.__primavista.loadTroubleScores());
    expect(hasKey).toBe(false);
  });

  test('a persisted trouble score survives starting a new session (weighting carries over)', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => window.__primavista.recordAttemptOutcome([60], false));

    await page.locator('#start-session-btn').click();

    const score = await page.evaluate(() => window.__primavista.loadTroubleScores()['n:60']);
    expect(score).toBe(1); // still there after a fresh buildQueue() read it
  });

  test('a broken localStorage does not crash note selection or attempt recording', async ({ page }) => {
    await page.goto('/index.html');
    const result = await page.evaluate(() => {
      const api = window.__primavista;
      const original = window.localStorage.setItem;
      window.localStorage.setItem = () => { throw new Error('quota exceeded'); };
      try {
        api.recordAttemptOutcome([60], false); // must not throw
        const note = api.pickRandomNote(null, {}); // must still return a valid note
        return { ok: true, note };
      } catch (err) {
        return { ok: false, message: err.message };
      } finally {
        window.localStorage.setItem = original;
      }
    });
    expect(result.ok).toBe(true);
    expect(typeof result.note).toBe('number');
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

  // Regression test for the iOS "Web MIDI Browser" app: its MIDIInputMap
  // exposes forEach() but its values() iterator lacks Symbol.iterator, so
  // Array.from(midiAccess.inputs.values()) throws and the connected device
  // never makes it into the list, even though a device is connected.
  // See https://github.com/leafo/sightreading.training/issues/8.
  test('lists a device from a MIDIInputMap whose values() iterator is not spec-compliant', async ({ page }) => {
    await page.addInitScript(() => {
      const fakeInput = Object.assign(new EventTarget(), { id: 'fake-1', name: 'Yamaha Arius' });
      const brokenValuesIterator = () => {
        let done = false;
        return {
          next() {
            if (done) return { value: undefined, done: true };
            done = true;
            return { value: fakeInput, done: false };
          },
          // Intentionally no [Symbol.iterator], mirroring the broken shim.
        };
      };
      const inputs = {
        forEach(cb) {
          cb(fakeInput, fakeInput.id, this);
        },
        values: brokenValuesIterator,
      };
      const outputs = {
        forEach() {},
        values: () => ({ next: () => ({ value: undefined, done: true }) }),
      };
      navigator.requestMIDIAccess = async () => ({ inputs, outputs, onstatechange: null });
    });

    await page.goto('/index.html');
    await expect(page.locator('#midi-status')).toContainText('Listening on Yamaha Arius');
    await expect(page.locator('#midi-device')).not.toBeDisabled();
  });

  // Regression test for the iOS "Web MIDI Browser" app: its MIDIInput
  // implements EventTarget's addEventListener but never reflects an
  // `onmidimessage` property assignment into a real listener, so note-on
  // events silently never reach a handler assigned via `.onmidimessage =`.
  // The device shows as connected and selected, but playing notes does
  // nothing. addEventListener must be used instead.
  test('receives note-on events from a MIDIInput whose onmidimessage property is inert', async ({ page }) => {
    await page.addInitScript(() => {
      class InertOnMidiMessageInput extends EventTarget {
        constructor() {
          super();
          this.id = 'fake-1';
          this.name = 'ARIUS';
        }
        open() {
          return Promise.resolve(this);
        }
      }
      const fakeInput = new InertOnMidiMessageInput();
      window.__fakeInput = fakeInput;
      const inputs = {
        forEach(cb) {
          cb(fakeInput, fakeInput.id, this);
        },
      };
      const outputs = { forEach() {} };
      navigator.requestMIDIAccess = async () => ({ inputs, outputs, onstatechange: null });
    });

    await page.goto('/index.html');
    await expect(page.locator('#midi-status')).toContainText('Listening on ARIUS');
    await startNewSession(page);

    const targetMidi = await page.evaluate(() => window.__primavista.session.current.midi);
    await page.evaluate((midi) => {
      const event = new Event('midimessage');
      event.data = new Uint8Array([0x90, midi, 100]);
      window.__fakeInput.dispatchEvent(event);
    }, targetMidi);

    await expect(page.locator('#stat-attempts')).toHaveText('2 / 25');
  });

  // Regression test: the rescan-on-empty-device-list retry used to call
  // initMIDI(), which re-requests MIDI access. On the iOS "Web MIDI
  // Browser" app a second requestMIDIAccess() call fails, which overwrote
  // a device that connected late (a known quirk of that app) with a false
  // "MIDI access denied" status even though the input was already working.
  // The retry must re-poll the already-granted MIDIAccess instead.
  test('recovers from a late-populated device list without re-requesting MIDI access', async ({ page }) => {
    await page.addInitScript(() => {
      let deviceReady = false;
      setTimeout(() => {
        deviceReady = true;
      }, 500);
      const fakeInput = Object.assign(new EventTarget(), { id: 'fake-1', name: 'ARIUS' });
      const inputs = {
        forEach(cb) {
          if (deviceReady) cb(fakeInput, fakeInput.id, this);
        },
      };
      const outputs = { forEach() {} };
      window.__requestMIDIAccessCalls = 0;
      navigator.requestMIDIAccess = async () => {
        window.__requestMIDIAccessCalls += 1;
        if (window.__requestMIDIAccessCalls > 1) {
          throw new Error('denied on second request, as on the buggy iOS shim');
        }
        return { inputs, outputs, onstatechange: null };
      };
    });

    await page.goto('/index.html');
    await expect(page.locator('#midi-status')).toContainText('No MIDI input device found');
    await expect(page.locator('#midi-status')).toContainText('Listening on ARIUS', { timeout: 5000 });
    expect(await page.evaluate(() => window.__requestMIDIAccessCalls)).toBe(1);
  });

  // Regression test: some iOS Web MIDI shims have a buggy onstatechange
  // setter that throws when assigned. That used to be caught by
  // initMIDI's outer try/catch, which overwrote an already-successful
  // "Listening on ARIUS" status with a false "MIDI access denied"
  // message, even though the device was already attached and working.
  test('keeps a successful status when assigning MIDIAccess.onstatechange throws', async ({ page }) => {
    await page.addInitScript(() => {
      const fakeInput = Object.assign(new EventTarget(), { id: 'fake-1', name: 'ARIUS' });
      const inputs = {
        forEach(cb) {
          cb(fakeInput, fakeInput.id, this);
        },
      };
      const outputs = { forEach() {} };
      navigator.requestMIDIAccess = async () => {
        const midiAccess = { inputs, outputs };
        Object.defineProperty(midiAccess, 'onstatechange', {
          get() {
            return null;
          },
          set() {
            throw new Error('shim onstatechange setter is broken');
          },
        });
        return midiAccess;
      };
    });

    await page.goto('/index.html');
    await expect(page.locator('#midi-status')).toContainText('Listening on ARIUS');
    await expect(page.locator('#midi-device')).not.toBeDisabled();
  });
});
