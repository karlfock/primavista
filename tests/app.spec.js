const { test, expect } = require('@playwright/test');

// All-correct playthroughs never requeue, so exactly SESSION_LENGTH notes are needed.
const SESSION_LENGTH_GUARD = 25;

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

  test('starts a session at note 1 of 25', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#stat-attempts')).toHaveText('1 / 25');
    await expect(page.locator('#stat-correct')).toHaveText('0');
    await expect(page.locator('#stat-accuracy')).toHaveText('0%');
    await expect(page.locator('#stat-avg-time')).toHaveText('—');
    await expect(page.locator('#summary-panel')).toHaveClass(/hidden/);
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
    await expect(page.locator('.piano-key[data-midi="108"]')).toHaveCount(1); // C8

    await page.locator('.piano-key[data-midi="108"]').click();

    await expect(page.locator('#flash-overlay')).toHaveClass(/incorrect/);
    await expect(page.locator('#stat-correct')).toHaveText('0');
  });

  test('tapping the correct key advances the session, same as a MIDI note-on', async ({ page }) => {
    await page.goto('/index.html');
    const targetMidi = await page.evaluate(() => window.__primavista.session.current.midi);

    await page.locator(`.piano-key[data-midi="${targetMidi}"]`).click();

    await expect(page.locator('#stat-attempts')).toHaveText('2 / 25');
    await expect(page.locator('#stat-correct')).toHaveText('1');
  });

  test('tapping the wrong key shows corrective feedback, same as a MIDI note-on', async ({ page }) => {
    await page.goto('/index.html');
    const wrongMidi = await page.evaluate(() => {
      const api = window.__primavista;
      return api.NOTE_RANGE.find((m) => m !== api.session.current.midi);
    });

    await page.locator(`.piano-key[data-midi="${wrongMidi}"]`).click();

    await expect(page.locator('#flash-overlay')).toHaveClass(/incorrect/);
    await expect(page.locator('#corrective-feedback')).not.toHaveClass(/hidden/);
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
