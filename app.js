// --- Pitch range (see SPEC.md) ---------------------------------------
const MIN_MIDI_NOTE = 21; // A0 — lowest note on a standard piano
const MAX_MIDI_NOTE = 96; // C7

// Natural (white-key) pitch classes — used for the default (naturals-only)
// note pool and to decide which notes need an accidental drawn.
const NATURAL_PITCH_CLASSES = { 0: 'c', 2: 'd', 4: 'e', 5: 'f', 7: 'g', 9: 'a', 11: 'b' };

// Spelling for all 12 chromatic pitch classes (see SPEC.md v5: chromatic
// notes). There's no key signature or tonal context here to justify
// enharmonic respelling (e.g. Eb vs D#), so accidentals are always spelled
// as sharps — the simplest consistent choice. Naturals map to [letter,
// null], so this is a strict superset of the old naturals-only spelling.
const PITCH_CLASS_SPELLING = {
  0: ['c', null], 1: ['c', '#'], 2: ['d', null], 3: ['d', '#'], 4: ['e', null],
  5: ['f', null], 6: ['f', '#'], 7: ['g', null], 8: ['g', '#'], 9: ['a', null],
  10: ['a', '#'], 11: ['b', null],
};

function isNaturalMidiNote(midi) {
  return Object.prototype.hasOwnProperty.call(NATURAL_PITCH_CLASSES, midi % 12);
}

function buildNoteRange(min, max) {
  const notes = [];
  for (let n = min; n <= max; n++) {
    if (isNaturalMidiNote(n)) notes.push(n);
  }
  return notes;
}

function buildChromaticRange(min, max) {
  const notes = [];
  for (let n = min; n <= max; n++) notes.push(n);
  return notes;
}

// Sharp pitch classes that share a letter with the natural pitch class one
// semitone below them (C#, D#, F#, G#, A#). A chord containing both — e.g.
// F and F# together, a minor second — would otherwise show two same-letter
// noteheads distinguished only by an accidental, which is ambiguous/
// incorrect notation: an accidental is understood to apply to every note
// of that same letter+octave for the rest of the measure. Respell the
// sharp note as the enharmonic flat of the next letter instead (F# -> Gb)
// so the two notes land on genuinely distinct staff positions, matching
// how a chromatic cluster like this is actually notated.
const SHARP_TO_FLAT_RESPELLING = {
  1: ['d', 'b'], 3: ['e', 'b'], 6: ['g', 'b'], 8: ['a', 'b'], 10: ['b', 'b'],
};

// chordMidis provides the collision context above; omit it (or pass just
// [midi]) for a note with no other notes sounding alongside it.
function spellNote(midi, chordMidis = [midi]) {
  const pitchClass = midi % 12;
  const [letter, accidental] = PITCH_CLASS_SPELLING[pitchClass];
  const octave = Math.floor(midi / 12) - 1;
  const respelling = SHARP_TO_FLAT_RESPELLING[pitchClass];
  if (accidental && respelling && chordMidis.includes(midi - 1)) {
    return { letter: respelling[0], accidental: respelling[1], octave };
  }
  return { letter, accidental, octave };
}

function midiToVexKey(midi, chordMidis) {
  const { letter, accidental, octave } = spellNote(midi, chordMidis);
  return `${letter}${accidental || ''}/${octave}`;
}

function midiToDisplayName(midi, chordMidis) {
  const { letter, accidental, octave } = spellNote(midi, chordMidis);
  return `${letter.toUpperCase()}${accidental || ''}${octave}`;
}

// Notes in this zone can be notated in either clef — see SPEC.md v2.
const AMBIGUITY_LOW = 48; // C3
const AMBIGUITY_HIGH = 72; // C5

function chooseClef(midi) {
  if (midi < AMBIGUITY_LOW) return 'bass';
  if (midi > AMBIGUITY_HIGH) return 'treble';
  return Math.random() < 0.5 ? 'treble' : 'bass';
}

const NOTE_RANGE = buildNoteRange(MIN_MIDI_NOTE, MAX_MIDI_NOTE);
const CHROMATIC_RANGE = buildChromaticRange(MIN_MIDI_NOTE, MAX_MIDI_NOTE);

function pickRandomNote(exclude, scores = {}) {
  const candidates = NOTE_RANGE.filter((m) => m !== exclude);
  return pickWeighted(candidates, (m) => 1 + (scores[troubleKeyForNote(m)] || 0));
}

function pickRandomChromaticNote(exclude, scores = {}) {
  const candidates = CHROMATIC_RANGE.filter((m) => m !== exclude);
  return pickWeighted(candidates, (m) => 1 + (scores[troubleKeyForNote(m)] || 0));
}

// --- Intervals (see SPEC.md v5) ------------------------------------------
// True chromatic interval qualities (m2 through P8 = 12 distinct semitone
// distances) need both notes to be able to land anywhere in the chromatic
// range, not just on naturals — a diatonic-only interval can't guarantee
// an exact quality (there's no natural note a minor third above C).
const MIN_INTERVAL_SEMITONES = 1; // minor 2nd
const MAX_INTERVAL_SEMITONES = 12; // octave

// Every valid (low, high) pair in the range, enumerated once. Generating
// only "low + distance = high" (rather than also considering the reverse
// direction) already covers every distinct pair exactly once, since a
// pair's low/high roles are fixed regardless of which one you'd call the
// "root". Small enough (well under 1000 entries) to keep in memory and
// weight-pick from directly, rather than the previous generate-and-retry
// approach — which also makes weighting by trouble score straightforward.
function buildIntervalCandidates() {
  const candidates = [];
  for (let low = MIN_MIDI_NOTE; low <= MAX_MIDI_NOTE; low++) {
    for (let distance = MIN_INTERVAL_SEMITONES; distance <= MAX_INTERVAL_SEMITONES; distance++) {
      const high = low + distance;
      if (high > MAX_MIDI_NOTE) break;
      candidates.push([low, high]);
    }
  }
  return candidates;
}
const INTERVAL_CANDIDATES = buildIntervalCandidates();

function pickIntervalPair(scores = {}) {
  return pickWeighted(INTERVAL_CANDIDATES, (pair) => 1 + (scores[troubleKeyForInterval(pair)] || 0));
}

// --- Weighted note selection (see SPEC.md v6) -----------------------------
// A per-item "trouble score" persisted in localStorage: +1 on a miss,
// -0.5 (floored at 0) on a correct answer. Selection weight is 1 + score,
// so an item you've missed 3 times is 4x as likely to come up as one
// you've never missed. Once enough correct answers bring a score back to
// 0, the entry is deleted entirely — it doesn't need a special "forget"
// step, selection just returns to the same baseline as everything else.
//
// The reward is deliberately smaller than the penalty (a full session
// never ends until every note has been re-queued until correct — see
// SPEC.md v3 — so a single miss is *guaranteed* an eventual same-session
// correct answer). With a symmetric +1/-1, that guaranteed redemption
// would silently cancel almost every miss back to exactly 0 before the
// session even ends, and near-nothing would carry over to influence
// future sessions — this was confirmed in real use: after two full
// sessions, localStorage held almost no trouble scores at all. Requiring
// two corrects to fully offset one miss means genuinely hard items keep
// some elevated weight past their first same-session retry.
const MISS_TROUBLE_DELTA = 1;
const CORRECT_TROUBLE_DELTA = 0.5;
//
// Interval items are keyed by the *exact pair* (e.g. "i:65-66"), not by
// interval type (e.g. "minor 2nd") — weighting by type would bias toward
// showing more of whichever type you're weak at in general, which edges
// back toward the predictability problem interval mode deliberately
// avoids (see SPEC.md v5: a foreseeable interval type lets you read one
// note and infer the other instead of judging the actual gap). Keying on
// the specific pair targets real weak spots without making the type
// itself predictable.
const TROUBLE_SCORE_STORAGE_KEY = 'primavista:troubleScores';

function troubleKeyForNote(midi) {
  return `n:${midi}`;
}

function troubleKeyForInterval(midis) {
  const [low, high] = [...midis].sort((a, b) => a - b);
  return `i:${low}-${high}`;
}

function troubleKeyFor(midis) {
  return midis.length === 1 ? troubleKeyForNote(midis[0]) : troubleKeyForInterval(midis);
}

// localStorage can throw (private browsing, quota, disabled) — weighting
// is a nice-to-have, so failures here just fall back to empty/uniform
// weighting rather than breaking the app.
function loadTroubleScores() {
  try {
    const raw = localStorage.getItem(TROUBLE_SCORE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

function saveTroubleScores(scores) {
  try {
    localStorage.setItem(TROUBLE_SCORE_STORAGE_KEY, JSON.stringify(scores));
  } catch (err) {
    // Not persisted this time; non-fatal.
  }
}

function recordAttemptOutcome(midis, wasCorrect) {
  const scores = loadTroubleScores();
  const key = troubleKeyFor(midis);
  const current = scores[key] || 0;
  const next = wasCorrect
    ? Math.max(0, current - CORRECT_TROUBLE_DELTA)
    : current + MISS_TROUBLE_DELTA;
  if (next <= 0) {
    delete scores[key];
  } else {
    scores[key] = next;
  }
  saveTroubleScores(scores);
}

// Weighted random pick: each candidate's weight is 1 + its trouble score,
// so it degrades to plain uniform selection when scores is empty/all-zero.
function pickWeighted(candidates, weightFn) {
  const weights = candidates.map(weightFn);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r < 0) return candidates[i];
  }
  return candidates[candidates.length - 1]; // floating-point fallback
}

// --- Sessions (see SPEC.md v3) -------------------------------------------
const SESSION_LENGTH = 25;
const INCORRECT_FEEDBACK_MS = 1500;

// Every queue item and session.current carries both `midi` (the first/
// lowest target note — kept so existing single-note-mode code and tests
// that only ever cared about one note don't need to change) and `midis`
// (the full target, length 1 for a single note or 2 for an interval
// chord — the only field the matching/rendering logic actually needs).
function buildQueue(count, { intervalMode = false, chromaticMode = false } = {}) {
  const scores = loadTroubleScores(); // read once per session, not once per note
  const queue = [];
  let previous = null;
  for (let i = 0; i < count; i++) {
    const midis = intervalMode
      ? pickIntervalPair(scores)
      : [chromaticMode ? pickRandomChromaticNote(previous, scores) : pickRandomNote(previous, scores)];
    queue.push({ midi: midis[0], midis, isFirstPresentation: true });
    previous = midis[0];
  }
  return queue;
}

// Missed notes reappear later in the session rather than immediately next,
// so the user can't just retry from muscle memory a beat later.
function requeue(midis, queue) {
  const item = { midi: midis[0], midis, isFirstPresentation: false };
  const insertAt = queue.length === 0 ? 0 : 1 + Math.floor(Math.random() * queue.length);
  queue.splice(insertAt, 0, item);
}

// --- App state ---------------------------------------------------------
const session = {
  queue: [],
  current: null, // { midi, midis, clef, isFirstPresentation }
  noteStartTime: null,
  presentedCount: 0,
  firstTryCorrect: 0,
  responseTimes: [],
  finished: false,
  awaitingAdvance: false, // true while corrective feedback is shown after a miss
};

// --- Staff rendering (VexFlow grand staff) ------------------------------
const STAFF_WIDTH = 380;
const STAFF_HEIGHT = 330;

function renderStaff(targetMidis, clef) {
  const midis = Array.isArray(targetMidis) ? targetMidis : [targetMidis];
  const container = document.getElementById('staff');
  container.innerHTML = '';

  const VF = Vex.Flow;
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(STAFF_WIDTH, STAFF_HEIGHT);
  const context = renderer.getContext();

  const trebleStave = new VF.Stave(10, 40, STAFF_WIDTH - 30).addClef('treble');
  const bassStave = new VF.Stave(10, 170, STAFF_WIDTH - 30).addClef('bass');
  trebleStave.setContext(context).draw();
  bassStave.setContext(context).draw();

  new VF.StaveConnector(trebleStave, bassStave)
    .setType(VF.StaveConnector.type.BRACE)
    .setContext(context)
    .draw();
  new VF.StaveConnector(trebleStave, bassStave)
    .setType(VF.StaveConnector.type.SINGLE_LEFT)
    .setContext(context)
    .draw();
  new VF.StaveConnector(trebleStave, bassStave)
    .setType(VF.StaveConnector.type.SINGLE_RIGHT)
    .setContext(context)
    .draw();

  const targetStave = clef === 'treble' ? trebleStave : bassStave;
  const keys = midis.map((midi) => midiToVexKey(midi, midis));

  const note = new VF.StaveNote({ clef, keys, duration: 'w' });
  midis.forEach((midi, index) => {
    const { accidental } = spellNote(midi, midis);
    if (accidental) note.addModifier(new VF.Accidental(accidental), index);
  });

  const voice = new VF.Voice({ num_beats: 4, beat_value: 4 }).setStrict(false);
  voice.addTickables([note]);
  new VF.Formatter().joinVoices([voice]).format([voice], STAFF_WIDTH - 120);
  voice.draw(context, targetStave);
}

// --- Feedback flash ------------------------------------------------------
let flashTimeout = null;

function flash(kind) {
  const overlay = document.getElementById('flash-overlay');
  overlay.classList.remove('correct', 'incorrect');
  // Force reflow so re-triggering the same class restarts the transition.
  void overlay.offsetWidth;
  overlay.classList.add(kind);
  if (flashTimeout) clearTimeout(flashTimeout);
  flashTimeout = setTimeout(() => overlay.classList.remove(kind), 250);
}

// --- Corrective feedback (shown on misses only, see SPEC.md v3) --------
function showCorrectiveFeedback(midis) {
  const el = document.getElementById('corrective-feedback');
  const names = midis.map((midi) => midiToDisplayName(midi, midis)).join(' + ');
  el.textContent = `That was ${names}`;
  el.classList.remove('hidden');
}

function hideCorrectiveFeedback() {
  document.getElementById('corrective-feedback').classList.add('hidden');
}

// --- Stats display ---------------------------------------------------------
function averageResponseTime(responseTimes) {
  if (responseTimes.length === 0) return null;
  return responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
}

function formatResponseTime(avgMs) {
  return avgMs === null ? '—' : `${(avgMs / 1000).toFixed(2)}s`;
}

function updateStatsDisplay() {
  const { presentedCount, firstTryCorrect, responseTimes } = session;
  document.getElementById('stat-attempts').textContent = `${presentedCount} / ${SESSION_LENGTH}`;
  document.getElementById('stat-correct').textContent = firstTryCorrect;

  const accuracyEl = document.getElementById('stat-accuracy');
  accuracyEl.textContent = presentedCount > 0
    ? `${Math.round((firstTryCorrect / presentedCount) * 100)}%`
    : '—';

  document.getElementById('stat-avg-time').textContent = formatResponseTime(averageResponseTime(responseTimes));
}

// --- Core loop (see SPEC.md v3: single attempt per note, fixed sessions) --
function showNextNote() {
  const item = session.queue.shift();
  // The lower note anchors clef choice for a chord — the same rule as a
  // single note, applied to whichever of the 1-2 target notes is lowest.
  const clef = chooseClef(Math.min(...item.midis));
  session.current = { midi: item.midi, midis: item.midis, clef, isFirstPresentation: item.isFirstPresentation };
  if (item.isFirstPresentation) {
    session.presentedCount += 1;
  }
  session.noteStartTime = Date.now();
  hideCorrectiveFeedback();
  renderStaff(item.midis, clef);
  updateStatsDisplay();
}

function advance() {
  if (session.queue.length === 0) {
    endSession();
  } else {
    showNextNote();
  }
}

function endSession() {
  session.finished = true;
  session.current = null;
  showSummary();
}

function showSummary() {
  document.getElementById('summary-correct').textContent = session.firstTryCorrect;
  document.getElementById('summary-total').textContent = SESSION_LENGTH;
  document.getElementById('summary-avg-time').textContent = formatResponseTime(averageResponseTime(session.responseTimes));
  document.getElementById('staff-panel').classList.add('hidden');
  document.getElementById('stats-panel').classList.add('hidden');
  document.getElementById('summary-panel').classList.remove('hidden');
}

function startSession() {
  session.queue = buildQueue(SESSION_LENGTH, {
    intervalMode: practiceOptions.interval,
    chromaticMode: practiceOptions.chromatic,
  });
  session.current = null;
  session.presentedCount = 0;
  session.firstTryCorrect = 0;
  session.responseTimes = [];
  session.finished = false;
  session.awaitingAdvance = false;

  document.getElementById('idle-panel').classList.add('hidden');
  document.getElementById('summary-panel').classList.add('hidden');
  document.getElementById('staff-panel').classList.remove('hidden');
  document.getElementById('stats-panel').classList.remove('hidden');

  showNextNote();
}

// Generalizes to a chord's two target notes via a "still needed" pending
// set: any note-on not in it is an immediate miss (single attempt, same
// as before); a hit removes it from the set, and only once the set is
// empty does the attempt resolve as correct. For a single-note target
// (pendingMidis starts with one element) this reduces to exactly the old
// one-note-on-immediately-resolves behavior.
function onNoteOn(midiNote) {
  if (session.finished || session.awaitingAdvance || !session.current) return;

  if (!session.current.pendingMidis) {
    session.current.pendingMidis = [...session.current.midis];
  }
  const pending = session.current.pendingMidis;
  const hitIndex = pending.indexOf(midiNote);

  if (hitIndex === -1) {
    flash('incorrect');
    showCorrectiveFeedback(session.current.midis);
    requeue(session.current.midis, session.queue);
    recordAttemptOutcome(session.current.midis, false);
    session.awaitingAdvance = true;
    setTimeout(() => {
      session.awaitingAdvance = false;
      advance();
    }, INCORRECT_FEEDBACK_MS);
    return;
  }

  pending.splice(hitIndex, 1);
  if (pending.length > 0) return; // chord: still waiting on the other note(s)

  const responseTime = Date.now() - session.noteStartTime;
  session.responseTimes.push(responseTime);
  if (session.current.isFirstPresentation) {
    session.firstTryCorrect += 1;
  }
  recordAttemptOutcome(session.current.midis, true);
  flash('correct');
  updateStatsDisplay();
  advance();
}

// --- Web MIDI -------------------------------------------------------------
let currentInput = null;

function handleMIDIMessage(event) {
  const [status, note, velocity] = event.data;
  const command = status & 0xf0;
  const isNoteOn = command === 0x90 && velocity > 0;
  if (isNoteOn) onNoteOn(note);
}

function attachInput(input) {
  if (currentInput) {
    currentInput.removeEventListener('midimessage', handleMIDIMessage);
  }
  currentInput = input;
  if (currentInput) {
    // Some iOS Web MIDI shims (e.g. the "Web MIDI Browser" app) implement
    // EventTarget's addEventListener but never wire up the `onmidimessage`
    // property, so a handler assigned that way silently never fires.
    // addEventListener works on both real browsers and those shims.
    currentInput.addEventListener('midimessage', handleMIDIMessage);
    if (typeof currentInput.open === 'function') {
      currentInput.open().catch(() => {});
    }
  }
}

function setStatus(message, kind) {
  const el = document.getElementById('midi-status');
  el.textContent = message;
  el.classList.remove('ok', 'error');
  if (kind) el.classList.add(kind);
}

let rescanTimer = null;

function populateDeviceList(midiAccess) {
  const select = document.getElementById('midi-device');
  // Some iOS Web MIDI shims (e.g. the "Web MIDI Browser" app) implement
  // MIDIInputMap without a spec-compliant iterator, so `.values()` +
  // Array.from throws. forEach is the one method every implementation
  // supports, so use that instead.
  const inputs = [];
  midiAccess.inputs.forEach((input) => inputs.push(input));

  select.innerHTML = '';

  if (inputs.length === 0) {
    select.disabled = true;
    select.innerHTML = '<option value="">No devices found</option>';
    attachInput(null);
    setStatus('No MIDI input device found. Connect a device.', 'error');
    // Some environments (e.g. iOS Web MIDI Browser) populate the device
    // list late and never fire statechange — keep rescanning until found.
    if (!rescanTimer) {
      rescanTimer = setTimeout(() => {
        rescanTimer = null;
        // Re-poll the already-granted MIDIAccess instead of calling
        // initMIDI() (which re-requests access). Some iOS Web MIDI shims
        // fail a second requestMIDIAccess() call, which would overwrite
        // a working connection's status with a false "access denied"
        // even though the original input is still attached and working.
        populateDeviceList(midiAccess);
      }, 2000);
    }
    return;
  }

  if (rescanTimer) {
    clearTimeout(rescanTimer);
    rescanTimer = null;
  }

  select.disabled = false;
  for (const input of inputs) {
    const option = document.createElement('option');
    option.value = input.id;
    option.textContent = input.name || input.id;
    select.appendChild(option);
  }

  const stillConnected = currentInput && inputs.some((i) => i.id === currentInput.id);
  const chosenId = stillConnected ? currentInput.id : inputs[0].id;
  select.value = chosenId;
  attachInput(inputs.find((i) => i.id === chosenId));
  setStatus(`Listening on ${select.options[select.selectedIndex].textContent}`, 'ok');

  select.onchange = () => {
    const input = inputs.find((i) => i.id === select.value);
    attachInput(input);
    setStatus(`Listening on ${select.options[select.selectedIndex].textContent}`, 'ok');
  };
}

async function initMIDI() {
  if (!navigator.requestMIDIAccess) {
    setStatus('Web MIDI API is not supported in this browser.', 'error');
    return;
  }
  try {
    const midiAccess = await navigator.requestMIDIAccess();
    populateDeviceList(midiAccess);
    try {
      // Some iOS Web MIDI shims have a buggy onstatechange setter that
      // throws when assigned. Left unguarded, that exception falls into
      // the outer catch below and overwrites the status text that
      // populateDeviceList just set correctly with a false "access
      // denied" message — even though the device is already attached
      // and working. Isolate it so a failure here is non-fatal; the
      // rescan-on-empty-list fallback in populateDeviceList still
      // covers devices that connect late.
      midiAccess.onstatechange = () => populateDeviceList(midiAccess);
    } catch (err) {
      // Live device-list updates aren't available; non-fatal.
    }
  } catch (err) {
    setStatus('MIDI access denied. Grant permission and reload.', 'error');
  }
}

// --- Virtual piano (on-screen keyboard, no MIDI device required) --------
// Full 88-key range (A0-C8), not the app's A0-C7 quiz range — the top
// octave (C#7-C8) can never be a correct answer, but it's included for
// visual fidelity to a real piano.
const PIANO_MIN_MIDI_NOTE = 21; // A0
const PIANO_MAX_MIDI_NOTE = 108; // C8
const PIANO_WHITE_KEY_COUNT = Array.from(
  { length: PIANO_MAX_MIDI_NOTE - PIANO_MIN_MIDI_NOTE + 1 },
  (_, i) => PIANO_MIN_MIDI_NOTE + i,
).filter(isNaturalMidiNote).length;
const PIANO_WHITE_KEY_HEIGHT = 140;
const PIANO_BLACK_KEY_HEIGHT = 90;
// Key width is computed from the available viewport width so the piano
// fills the screen on desktop without scrolling — fitting all 52 white
// keys with no scroll needs >= 52 * MIN px of width, so MIN has to stay
// well below typical laptop widths (~1280px) or "no scroll on desktop"
// would never actually be reachable. On narrow/mobile viewports this
// floor is always hit and horizontal scroll is expected. MAX keeps keys
// from becoming oversized blocks on very wide monitors.
const PIANO_MIN_WHITE_KEY_WIDTH = 16;
const PIANO_MAX_WHITE_KEY_WIDTH = 48;
const PIANO_BLACK_TO_WHITE_WIDTH_RATIO = 22 / 36;

function computePianoWhiteKeyWidth(container) {
  const wrap = container.parentElement;
  const wrapStyle = getComputedStyle(wrap);
  const paddingX = parseFloat(wrapStyle.paddingLeft) + parseFloat(wrapStyle.paddingRight);
  const borderX = parseFloat(wrapStyle.borderLeftWidth) + parseFloat(wrapStyle.borderRightWidth);
  // Measured from the document root, not the 100vw-wide wrap itself:
  // `vw` units include the vertical scrollbar's width in most browsers,
  // which would otherwise make the computed width slightly wider than
  // what's actually visible whenever a scrollbar is present.
  const availableWidth = document.documentElement.clientWidth - paddingX - borderX;
  const idealWidth = availableWidth / PIANO_WHITE_KEY_COUNT;
  return Math.min(PIANO_MAX_WHITE_KEY_WIDTH, Math.max(PIANO_MIN_WHITE_KEY_WIDTH, idealWidth));
}

function buildPiano() {
  const container = document.getElementById('piano');
  container.innerHTML = '';

  const whiteKeyWidth = computePianoWhiteKeyWidth(container);
  const blackKeyWidth = whiteKeyWidth * PIANO_BLACK_TO_WHITE_WIDTH_RATIO;

  container.style.height = `${PIANO_WHITE_KEY_HEIGHT}px`;

  let whiteIndex = 0;
  const whiteIndexByMidi = new Map();
  const blackMidiNotes = [];

  for (let midi = PIANO_MIN_MIDI_NOTE; midi <= PIANO_MAX_MIDI_NOTE; midi++) {
    if (isNaturalMidiNote(midi)) {
      whiteIndexByMidi.set(midi, whiteIndex);
      const key = document.createElement('div');
      key.className = 'piano-key white';
      key.dataset.midi = midi;
      key.style.left = `${whiteIndex * whiteKeyWidth}px`;
      key.style.width = `${whiteKeyWidth}px`;
      key.style.height = `${PIANO_WHITE_KEY_HEIGHT}px`;
      container.appendChild(key);
      whiteIndex += 1;
    } else {
      blackMidiNotes.push(midi);
    }
  }

  container.style.width = `${whiteIndex * whiteKeyWidth}px`;

  // Every black key's pitch class sits a semitone above a natural (the
  // white key just below it), which by iteration order already has a
  // whiteIndex assigned — position it centered on that key's right edge.
  for (const midi of blackMidiNotes) {
    const precedingWhiteIndex = whiteIndexByMidi.get(midi - 1);
    const key = document.createElement('div');
    key.className = 'piano-key black';
    key.dataset.midi = midi;
    key.style.left = `${(precedingWhiteIndex + 1) * whiteKeyWidth - blackKeyWidth / 2}px`;
    key.style.width = `${blackKeyWidth}px`;
    key.style.height = `${PIANO_BLACK_KEY_HEIGHT}px`;
    container.appendChild(key);
  }
}

// Key elements are recreated on every buildPiano() call (e.g. on resize),
// but the container itself is stable, so delegated listeners are attached
// to it once here rather than re-added on every rebuild.
function initPianoInteraction() {
  const container = document.getElementById('piano');

  const clearActive = () => {
    container.querySelectorAll('.piano-key.active').forEach((key) => key.classList.remove('active'));
  };

  container.addEventListener('pointerdown', (event) => {
    const key = event.target.closest('.piano-key');
    if (!key) return;
    event.preventDefault();
    key.classList.add('active');
    onNoteOn(Number(key.dataset.midi));
  });
  container.addEventListener('pointerup', clearActive);
  container.addEventListener('pointercancel', clearActive);

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildPiano, 150);
  });
}

// --- Practice options (see SPEC.md v5) -----------------------------------
// Checking a box only updates this state — it does NOT restart whatever
// session is in progress. Applying it requires the explicit "Start new
// session" action, so changing a setting can never silently discard
// progress the user didn't ask to discard.
const practiceOptions = { chromatic: false, interval: false };

// Interval mode always draws both notes from the full chromatic range
// (see SPEC.md v5 — a diatonic-only interval can't guarantee an exact
// interval quality), independent of the "Chromatic notes" checkbox. Left
// alone, that checkbox would look inert/disconnected while interval mode
// is on. Show it as checked + disabled instead, so its state honestly
// reflects "chromatic notes are in effect right now," and restore the
// user's own preference once interval mode is turned back off.
function updateChromaticCheckboxState() {
  const chromaticCheckbox = document.getElementById('chromatic-toggle');
  chromaticCheckbox.disabled = practiceOptions.interval;
  chromaticCheckbox.checked = practiceOptions.interval ? true : practiceOptions.chromatic;
  chromaticCheckbox.title = practiceOptions.interval
    ? 'Interval mode always uses chromatic notes'
    : '';
}

function initPracticeOptions() {
  document.getElementById('chromatic-toggle').addEventListener('change', (event) => {
    practiceOptions.chromatic = event.target.checked;
  });
  document.getElementById('interval-toggle').addEventListener('change', (event) => {
    practiceOptions.interval = event.target.checked;
    updateChromaticCheckboxState();
  });
  document.getElementById('start-session-btn').addEventListener('click', startSession);
}

// --- Boot ---------------------------------------------------------
// No startSession() call here — the app starts idle (see #idle-panel in
// index.html). session.current stays null until the user explicitly
// clicks "Start new session", and onNoteOn's existing guard clause
// (`!session.current`) already no-ops any note input — MIDI or the
// on-screen piano — until then, so nothing extra is needed there.
document.getElementById('play-again-btn').addEventListener('click', startSession);
initMIDI();
buildPiano();
initPianoInteraction();
initPracticeOptions();

// Exposed for the Playwright suite (tests/app.spec.js). This is a plain
// script with no module system, so `const`/`let` bindings above aren't
// reachable from outside — namespacing the ones tests need here is simpler
// than converting the app to modules for an MVP this size.
window.__primavista = {
  session,
  NOTE_RANGE,
  CHROMATIC_RANGE,
  MIN_MIDI_NOTE,
  MAX_MIDI_NOTE,
  AMBIGUITY_LOW,
  AMBIGUITY_HIGH,
  MIN_INTERVAL_SEMITONES,
  MAX_INTERVAL_SEMITONES,
  PIANO_MIN_MIDI_NOTE,
  PIANO_MAX_MIDI_NOTE,
  SESSION_LENGTH,
  INCORRECT_FEEDBACK_MS,
  STAFF_WIDTH,
  STAFF_HEIGHT,
  practiceOptions,
  isNaturalMidiNote,
  midiToVexKey,
  midiToDisplayName,
  chooseClef,
  pickIntervalPair,
  pickRandomNote,
  renderStaff,
  onNoteOn,
  startSession,
  TROUBLE_SCORE_STORAGE_KEY,
  MISS_TROUBLE_DELTA,
  CORRECT_TROUBLE_DELTA,
  troubleKeyForNote,
  troubleKeyForInterval,
  loadTroubleScores,
  recordAttemptOutcome,
};
