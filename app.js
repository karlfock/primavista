// --- Pitch range (see SPEC.md) ---------------------------------------
const MIN_MIDI_NOTE = 36; // C2
const MAX_MIDI_NOTE = 96; // C7
const MIDDLE_C = 60;

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

function clefForMidi(midi) {
  return midi >= MIDDLE_C ? 'treble' : 'bass';
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

// --- App state ---------------------------------------------------------
const state = {
  targetMidi: null,
  noteStartTime: null,
  missedThisNote: false,
  stats: {
    attempts: 0,
    firstTryCorrect: 0,
    responseTimes: [],
  },
};

// --- Staff rendering (VexFlow grand staff) ------------------------------
const STAFF_WIDTH = 380;
const STAFF_HEIGHT = 330;

function renderStaff(targetMidi) {
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

  const clef = clefForMidi(targetMidi);
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

// --- Stats display ---------------------------------------------------------
function updateStatsDisplay() {
  const { attempts, firstTryCorrect, responseTimes } = state.stats;
  document.getElementById('stat-attempts').textContent = attempts;
  document.getElementById('stat-correct').textContent = firstTryCorrect;

  const accuracyEl = document.getElementById('stat-accuracy');
  accuracyEl.textContent = attempts > 0
    ? `${Math.round((firstTryCorrect / attempts) * 100)}%`
    : '—';

  const avgEl = document.getElementById('stat-avg-time');
  if (responseTimes.length > 0) {
    const avgMs = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    avgEl.textContent = `${(avgMs / 1000).toFixed(2)}s`;
  } else {
    avgEl.textContent = '—';
  }
}

// --- Core loop ---------------------------------------------------------
function nextNote() {
  state.targetMidi = pickRandomNote(state.targetMidi);
  state.noteStartTime = Date.now();
  state.missedThisNote = false;
  state.stats.attempts += 1;
  renderStaff(state.targetMidi);
  updateStatsDisplay();
}

function onNoteOn(midiNote) {
  if (state.targetMidi === null) return;

  if (midiNote === state.targetMidi) {
    const responseTime = Date.now() - state.noteStartTime;
    if (!state.missedThisNote) {
      state.stats.firstTryCorrect += 1;
    }
    state.stats.responseTimes.push(responseTime);
    flash('correct');
    updateStatsDisplay();
    nextNote();
  } else {
    state.missedThisNote = true;
    flash('incorrect');
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
    currentInput.onmidimessage = null;
  }
  currentInput = input;
  if (currentInput) {
    currentInput.onmidimessage = handleMIDIMessage;
  }
}

function setStatus(message, kind) {
  const el = document.getElementById('midi-status');
  el.textContent = message;
  el.classList.remove('ok', 'error');
  if (kind) el.classList.add(kind);
}

function populateDeviceList(midiAccess) {
  const select = document.getElementById('midi-device');
  const inputs = Array.from(midiAccess.inputs.values());

  select.innerHTML = '';

  if (inputs.length === 0) {
    select.disabled = true;
    select.innerHTML = '<option value="">No devices found</option>';
    attachInput(null);
    setStatus('No MIDI input device found. Connect a device.', 'error');
    return;
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
    midiAccess.onstatechange = () => populateDeviceList(midiAccess);
  } catch (err) {
    setStatus('MIDI access denied. Grant permission and reload.', 'error');
  }
}

// --- Boot ---------------------------------------------------------
initMIDI();
nextNote();
