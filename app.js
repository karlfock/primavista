// --- Pitch range (see SPEC.md) ---------------------------------------
const MIN_MIDI_NOTE = 21; // A0 — lowest note on a standard piano
const MAX_MIDI_NOTE = 96; // C7

// Natural (white-key) pitch classes only — no accidentals in v1.
const NATURAL_PITCH_CLASSES = { 0: 'c', 2: 'd', 4: 'e', 5: 'f', 7: 'g', 9: 'a', 11: 'b' };

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

function midiToVexKey(midi) {
  const letter = NATURAL_PITCH_CLASSES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${letter}/${octave}`;
}

function midiToDisplayName(midi) {
  const letter = NATURAL_PITCH_CLASSES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${letter.toUpperCase()}${octave}`;
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

function pickRandomNote(exclude) {
  if (NOTE_RANGE.length === 1) return NOTE_RANGE[0];
  let candidate;
  do {
    candidate = NOTE_RANGE[Math.floor(Math.random() * NOTE_RANGE.length)];
  } while (candidate === exclude);
  return candidate;
}

// --- Sessions (see SPEC.md v3) -------------------------------------------
const SESSION_LENGTH = 25;
const INCORRECT_FEEDBACK_MS = 1500;

function buildQueue(count) {
  const queue = [];
  let previous = null;
  for (let i = 0; i < count; i++) {
    const midi = pickRandomNote(previous);
    queue.push({ midi, isFirstPresentation: true });
    previous = midi;
  }
  return queue;
}

// Missed notes reappear later in the session rather than immediately next,
// so the user can't just retry from muscle memory a beat later.
function requeue(midi, queue) {
  const item = { midi, isFirstPresentation: false };
  const insertAt = queue.length === 0 ? 0 : 1 + Math.floor(Math.random() * queue.length);
  queue.splice(insertAt, 0, item);
}

// --- App state ---------------------------------------------------------
const session = {
  queue: [],
  current: null, // { midi, clef, isFirstPresentation }
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

function renderStaff(targetMidi, clef) {
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
  const key = midiToVexKey(targetMidi);

  const note = new VF.StaveNote({ clef, keys: [key], duration: 'w' });

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
function showCorrectiveFeedback(midi) {
  const el = document.getElementById('corrective-feedback');
  el.textContent = `That was ${midiToDisplayName(midi)}`;
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
  const clef = chooseClef(item.midi);
  session.current = { midi: item.midi, clef, isFirstPresentation: item.isFirstPresentation };
  if (item.isFirstPresentation) {
    session.presentedCount += 1;
  }
  session.noteStartTime = Date.now();
  hideCorrectiveFeedback();
  renderStaff(item.midi, clef);
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
  session.queue = buildQueue(SESSION_LENGTH);
  session.current = null;
  session.presentedCount = 0;
  session.firstTryCorrect = 0;
  session.responseTimes = [];
  session.finished = false;
  session.awaitingAdvance = false;

  document.getElementById('summary-panel').classList.add('hidden');
  document.getElementById('staff-panel').classList.remove('hidden');
  document.getElementById('stats-panel').classList.remove('hidden');

  showNextNote();
}

function onNoteOn(midiNote) {
  if (session.finished || session.awaitingAdvance || !session.current) return;

  if (midiNote === session.current.midi) {
    const responseTime = Date.now() - session.noteStartTime;
    session.responseTimes.push(responseTime);
    if (session.current.isFirstPresentation) {
      session.firstTryCorrect += 1;
    }
    flash('correct');
    updateStatsDisplay();
    advance();
  } else {
    flash('incorrect');
    showCorrectiveFeedback(session.current.midi);
    requeue(session.current.midi, session.queue);
    session.awaitingAdvance = true;
    setTimeout(() => {
      session.awaitingAdvance = false;
      advance();
    }, INCORRECT_FEEDBACK_MS);
  }
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
const PIANO_WHITE_KEY_WIDTH = 36;
const PIANO_WHITE_KEY_HEIGHT = 140;
const PIANO_BLACK_KEY_WIDTH = 22;
const PIANO_BLACK_KEY_HEIGHT = 90;

function buildPiano() {
  const container = document.getElementById('piano');
  container.innerHTML = '';
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
      key.style.left = `${whiteIndex * PIANO_WHITE_KEY_WIDTH}px`;
      key.style.width = `${PIANO_WHITE_KEY_WIDTH}px`;
      key.style.height = `${PIANO_WHITE_KEY_HEIGHT}px`;
      container.appendChild(key);
      whiteIndex += 1;
    } else {
      blackMidiNotes.push(midi);
    }
  }

  container.style.width = `${whiteIndex * PIANO_WHITE_KEY_WIDTH}px`;

  // Every black key's pitch class sits a semitone above a natural (the
  // white key just below it), which by iteration order already has a
  // whiteIndex assigned — position it centered on that key's right edge.
  for (const midi of blackMidiNotes) {
    const precedingWhiteIndex = whiteIndexByMidi.get(midi - 1);
    const key = document.createElement('div');
    key.className = 'piano-key black';
    key.dataset.midi = midi;
    key.style.left = `${(precedingWhiteIndex + 1) * PIANO_WHITE_KEY_WIDTH - PIANO_BLACK_KEY_WIDTH / 2}px`;
    key.style.width = `${PIANO_BLACK_KEY_WIDTH}px`;
    key.style.height = `${PIANO_BLACK_KEY_HEIGHT}px`;
    container.appendChild(key);
  }

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
}

// --- Boot ---------------------------------------------------------
document.getElementById('play-again-btn').addEventListener('click', startSession);
initMIDI();
buildPiano();
startSession();

// Exposed for the Playwright suite (tests/app.spec.js). This is a plain
// script with no module system, so `const`/`let` bindings above aren't
// reachable from outside — namespacing the ones tests need here is simpler
// than converting the app to modules for an MVP this size.
window.__primavista = {
  session,
  NOTE_RANGE,
  MIN_MIDI_NOTE,
  MAX_MIDI_NOTE,
  AMBIGUITY_LOW,
  AMBIGUITY_HIGH,
  PIANO_MIN_MIDI_NOTE,
  PIANO_MAX_MIDI_NOTE,
  SESSION_LENGTH,
  INCORRECT_FEEDBACK_MS,
  STAFF_WIDTH,
  STAFF_HEIGHT,
  isNaturalMidiNote,
  midiToVexKey,
  midiToDisplayName,
  chooseClef,
  renderStaff,
  onNoteOn,
  startSession,
};
