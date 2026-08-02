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

// A natural-sign accidental ('n', see "Key signatures" below) still needs
// a visible modifier drawn on the staff to cancel a key signature — but
// unlike '#'/'b', a bare letter+octave is already unambiguously natural,
// so it's omitted from the VexFlow key string and the text display name;
// only the modifier (added separately in renderStaff) actually shows it.
function accidentalSuffix(accidental) {
  return accidental && accidental !== 'n' ? accidental : '';
}

// Shared by both the key-less path below and the key-aware path (see
// "Key signatures" section) so the string formatting itself lives in one
// place regardless of which spelling produced the {letter, accidental,
// octave}.
function formatVexKey({ letter, accidental, octave }) {
  return `${letter}${accidentalSuffix(accidental)}/${octave}`;
}

function formatDisplayName({ letter, accidental, octave }) {
  return `${letter.toUpperCase()}${accidentalSuffix(accidental)}${octave}`;
}

function midiToVexKey(midi, chordMidis) {
  return formatVexKey(spellNote(midi, chordMidis));
}

function midiToDisplayName(midi, chordMidis) {
  return formatDisplayName(spellNote(midi, chordMidis));
}

// --- Key signatures ("Randomize key" mode, see BACKLOG.md #6) -----------
// Real music is essentially never "in C" — this lets each attempt pick one
// of the 15 standard key signatures (every major key that doesn't need a
// double sharp/flat) and spell/render relative to it, instead of always
// assuming C major/A minor. A major key and its relative minor share the
// exact same signature — the distinction between them is harmonic/
// functional (which chord a piece resolves to), which this app has no
// concept of (no chords being progressed, no cadences) — so there's only
// one list of 15 keys, not 15 major + 15 minor.
const SHARP_ORDER = ['f', 'c', 'g', 'd', 'a', 'e', 'b'];
const FLAT_ORDER = ['b', 'e', 'a', 'd', 'g', 'c', 'f'];

const KEY_SIGNATURE_INFO = {
  C: { type: 'none', count: 0 },
  G: { type: 'sharp', count: 1 }, D: { type: 'sharp', count: 2 }, A: { type: 'sharp', count: 3 },
  E: { type: 'sharp', count: 4 }, B: { type: 'sharp', count: 5 }, 'F#': { type: 'sharp', count: 6 },
  'C#': { type: 'sharp', count: 7 },
  F: { type: 'flat', count: 1 }, Bb: { type: 'flat', count: 2 }, Eb: { type: 'flat', count: 3 },
  Ab: { type: 'flat', count: 4 }, Db: { type: 'flat', count: 5 }, Gb: { type: 'flat', count: 6 },
  Cb: { type: 'flat', count: 7 },
};
const KEY_NAMES = Object.keys(KEY_SIGNATURE_INFO);

// Purely a display label (both names for the one shared signature) — not
// a second set of signatures to pick from.
const RELATIVE_MINOR_NAME = {
  C: 'A', G: 'E', D: 'B', A: 'F#', E: 'C#', B: 'G#', 'F#': 'D#', 'C#': 'A#',
  F: 'D', Bb: 'G', Eb: 'C', Ab: 'F', Db: 'Bb', Gb: 'Eb', Cb: 'Ab',
};

function keyDisplayName(keyName) {
  return `${keyName} major / ${RELATIVE_MINOR_NAME[keyName]} minor`;
}

function pickRandomKey() {
  return KEY_NAMES[Math.floor(Math.random() * KEY_NAMES.length)];
}

// Inverse of NATURAL_PITCH_CLASSES above — each letter's own unaltered
// pitch class, needed to work out what accidental (if any) reaches a
// target pitch from that letter, independent of what the key signature
// already implies for it.
const LETTER_NATURAL_PITCH_CLASS = Object.fromEntries(
  Object.entries(NATURAL_PITCH_CLASSES).map(([pitchClass, letter]) => [letter, Number(pitchClass)]),
);
const LETTERS = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];

// Per-letter accidental (+1 sharp, -1 flat, 0 none) implied by a key's
// signature — derived the same way real notation adds sharps/flats one at
// a time in the fixed order above, rather than a hand-transcribed table
// (15 keys x 7 letters is a lot to get right by hand).
function buildKeyAccidentals(keyName) {
  const info = KEY_SIGNATURE_INFO[keyName];
  const accidentals = { c: 0, d: 0, e: 0, f: 0, g: 0, a: 0, b: 0 };
  if (info.type === 'none') return accidentals;
  const order = info.type === 'sharp' ? SHARP_ORDER : FLAT_ORDER;
  const delta = info.type === 'sharp' ? 1 : -1;
  for (let i = 0; i < info.count; i++) accidentals[order[i]] = delta;
  return accidentals;
}
const KEY_ACCIDENTALS = Object.fromEntries(KEY_NAMES.map((k) => [k, buildKeyAccidentals(k)]));

function keyImpliedPitchClass(letter, keyName) {
  return (LETTER_NATURAL_PITCH_CLASS[letter] + KEY_ACCIDENTALS[keyName][letter] + 12) % 12;
}

const ACCIDENTAL_SYMBOL_BY_OFFSET = { '-2': 'bb', '-1': 'b', 0: 'n', 1: '#', 2: '##' };

// For a chromatic (out-of-key) pitch, returns either a single resolved
// spelling (an exact diatonic match, or a natural that cancels an
// existing key alteration — both unambiguous) or, when genuinely neither
// applies, the two competing single-accidental candidates (sharp of the
// lower diatonic neighbor letter, flat of the upper one) for the caller to
// choose between. Separated from the actual choosing (see spellInKey/
// spellChordInKey below) so a chord can avoid a same-letter collision by
// picking deliberately instead of coincidentally.
function spellCandidatesInKey(pitchClass, keyName) {
  for (const letter of LETTERS) {
    if (keyImpliedPitchClass(letter, keyName) === pitchClass) {
      // Diatonic to this key — the key signature at the clef already
      // covers the alteration (if any), so no accidental glyph is drawn
      // on the note itself, even though the pitch itself may be altered.
      return { resolved: { letter, accidental: null, offset: KEY_ACCIDENTALS[keyName][letter] } };
    }
  }

  const candidates = [];
  for (const letter of LETTERS) {
    const implied = keyImpliedPitchClass(letter, keyName);
    const isLowerNeighbor = implied === (pitchClass - 1 + 12) % 12;
    const isUpperNeighbor = implied === (pitchClass + 1) % 12;
    if (!isLowerNeighbor && !isUpperNeighbor) continue;
    // Offset relative to the letter's own natural pitch (not the key's
    // implied pitch) — an explicit accidental always means an absolute
    // offset from natural, regardless of what the key signature assumes.
    let offset = pitchClass - LETTER_NATURAL_PITCH_CLASS[letter];
    if (offset > 6) offset -= 12;
    if (offset < -6) offset += 12;
    candidates.push({ letter, accidental: ACCIDENTAL_SYMBOL_BY_OFFSET[offset], offset });
  }

  // A natural that cancels an existing key-signature alteration is the
  // standard, expected notation choice whenever it's available (and at
  // most one candidate can ever qualify, since two different letters
  // never share a natural pitch) — no real ambiguity in that case.
  const naturalCancel = candidates.find((c) => c.offset === 0);
  if (naturalCancel) return { resolved: naturalCancel };

  return { candidates };
}

// Single-note version: flips a coin between tied candidates, same pattern
// as the existing clef-ambiguity-zone randomization (see chooseClef).
function spellInKey(pitchClass, keyName) {
  const { resolved, candidates } = spellCandidatesInKey(pitchClass, keyName);
  if (resolved) return { ...resolved, hadChoice: false };
  const choice = candidates[Math.floor(Math.random() * candidates.length)];
  return { ...choice, hadChoice: candidates.length > 1 };
}

function spellNoteForKey(midi, keyName) {
  const pitchClass = ((midi % 12) + 12) % 12;
  const { letter, accidental, offset, hadChoice } = spellInKey(pitchClass, keyName);
  // The accidental's offset is always relative to the letter's own
  // natural pitch (see spellCandidatesInKey), so the octave has to be
  // computed the same way — e.g. MIDI 60 spelled as B# lands in octave 3,
  // not 4, because it's B3 (natural pitch) raised a semitone, not C4.
  const octave = Math.floor((midi - offset) / 12) - 1;
  return { letter, accidental, octave, hadChoice };
}

// Spells a 1- or 2-note target against one key. For a chord, if the
// second note's spelling has a genuine coin-flip choice (see
// spellCandidatesInKey) and one option would land it on the same
// letter+octave as the first note (ambiguous — an accidental is
// understood to apply to every note of that letter+octave for the rest of
// the measure), picks the other option instead — same goal as the
// existing SHARP_TO_FLAT_RESPELLING rule, generalized for an arbitrary
// key instead of one hardcoded always-sharp case.
function spellChordInKey(midis, keyName) {
  const pick = (index, avoidLetter, avoidOctave) => {
    const midi = midis[index];
    const pitchClass = ((midi % 12) + 12) % 12;
    const { resolved, candidates } = spellCandidatesInKey(pitchClass, keyName);
    const options = (resolved ? [resolved] : candidates).map((o) => ({
      ...o,
      octave: Math.floor((midi - o.offset) / 12) - 1,
    }));
    if (options.length === 1) return options[0];
    const nonColliding = options.filter((o) => !(o.letter === avoidLetter && o.octave === avoidOctave));
    const pool = nonColliding.length > 0 ? nonColliding : options; // both collide: accept it, same as the old system's narrow exception
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const first = pick(0, null, null);
  const results = [{ letter: first.letter, accidental: first.accidental, octave: first.octave }];
  if (midis.length > 1) {
    const second = pick(1, first.letter, first.octave);
    results.push({ letter: second.letter, accidental: second.accidental, octave: second.octave });
  }
  return results;
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

// Standard interval quality names by semitone distance (see BACKLOG.md:
// "Name the interval type in corrective feedback"). Naming the interval
// alongside the note names on a miss pairs the visual gap with its verbal
// label (dual coding) — this is purely a corrective-feedback addition, it
// doesn't change selection or matching, which stay keyed on the exact
// (low, high) pair (see troubleKeyForInterval).
const INTERVAL_NAMES = {
  1: 'minor 2nd', 2: 'major 2nd', 3: 'minor 3rd', 4: 'major 3rd',
  5: 'perfect 4th', 6: 'tritone', 7: 'perfect 5th', 8: 'minor 6th',
  9: 'major 6th', 10: 'minor 7th', 11: 'major 7th', 12: 'octave',
};

function intervalNameFor(midis) {
  const [low, high] = [...midis].sort((a, b) => a - b);
  return INTERVAL_NAMES[high - low];
}

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
  setDrillButtonAvailability(Object.keys(scores).length > 0);
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
// Long enough to read the note names (and, in interval mode, the interval
// name) at a glance without rushing — the corrective-feedback box can also
// be paused (stop the countdown) or closed early (see
// pauseCorrectiveFeedback/dismissCorrectiveFeedback), so this is a
// ceiling, not a forced wait.
const INCORRECT_FEEDBACK_MS = 10000;

// Every queue item and session.current carries both `midi` (the first/
// lowest target note — kept so existing single-note-mode code and tests
// that only ever cared about one note don't need to change) and `midis`
// (the full target, length 1 for a single note or 2 for an interval
// chord — the only field the matching/rendering logic actually needs).
// `key` is a randomly picked key signature name (see "Key signatures"
// above) when "Randomize key" is on, or null when it's off — picked once
// per attempt here (not per session, unlike chromatic/interval), so a
// requeued miss (see requeue below) has to carry its own key forward
// rather than getting a fresh one.
function buildQueue(count, { intervalMode = false, chromaticMode = false, randomizeKeyMode = false } = {}) {
  const scores = loadTroubleScores(); // read once per session, not once per note
  const queue = [];
  let previous = null;
  for (let i = 0; i < count; i++) {
    const midis = intervalMode
      ? pickIntervalPair(scores)
      : [chromaticMode ? pickRandomChromaticNote(previous, scores) : pickRandomNote(previous, scores)];
    const key = randomizeKeyMode ? pickRandomKey() : null;
    queue.push({ midi: midis[0], midis, isFirstPresentation: true, key });
    previous = midis[0];
  }
  return queue;
}

// Missed notes reappear later in the session rather than immediately next,
// so the user can't just retry from muscle memory a beat later. Carries
// the same key forward (see buildQueue) — it's the same attempt
// reappearing, not a new one, so it shouldn't get a fresh random key.
function requeue(midis, queue, key = null) {
  const item = { midi: midis[0], midis, isFirstPresentation: false, key };
  const insertAt = queue.length === 0 ? 0 : 1 + Math.floor(Math.random() * queue.length);
  queue.splice(insertAt, 0, item);
}

// --- "Drill my weak spots" session mode (see SPEC.md v7) -----------------
// Built directly on the trouble-score data above, but going further than
// just biasing a normal mixed session: a session made entirely from the
// current highest-scoring notes/intervals, so practice time goes straight
// at what's actually difficult right now instead of being diluted into a
// mostly-easy session. Reuses the existing single-attempt +
// requeue-until-correct loop unchanged (see requeue/onNoteOn) — "practiced
// until it clears" falls straight out of that mechanic once the queue is
// restricted to just the weak items, so no new mechanic is needed here.
function parseTroubleKey(key) {
  if (key.startsWith('n:')) return [Number(key.slice(2))];
  return key.slice(2).split('-').map(Number);
}

// Takes the current highest-scoring items, capped at the same length as a
// normal session — drill sessions are meant to be short, and with few
// weak spots recorded that's already true without needing a separate,
// smaller limit of its own.
function buildDrillQueue(scores) {
  const midisList = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, SESSION_LENGTH)
    .map(([key]) => parseTroubleKey(key));

  // Otherwise the first pass through the queue would always start with the
  // single worst item in the same spot every time — re-queue order on a
  // miss is already randomized (see requeue above); this does the same for
  // the initial pass.
  for (let i = midisList.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [midisList[i], midisList[j]] = [midisList[j], midisList[i]];
  }

  return midisList.map((midis) => ({ midi: midis[0], midis, isFirstPresentation: true }));
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
  length: SESSION_LENGTH, // notes needed to complete the session; dynamic for drill sessions
  mode: 'normal', // 'normal' | 'drill' — which queue-building strategy "Play again" repeats
};

// --- Staff rendering (VexFlow grand staff) ------------------------------
const STAFF_WIDTH = 380;
const STAFF_HEIGHT = 330;

// `keyName` + `spellings` (see "Key signatures" above) are only passed
// when "Randomize key" is on. `spellings` must be computed once (via
// spellChordInKey) by the caller and passed in rather than recomputed
// here, since it involves a genuine coin flip in some cases — recomputing
// it on every call could silently show a different spelling than the one
// corrective feedback later names for the same miss. When they're
// omitted, this falls back to the original key-less path unchanged.
function renderStaff(targetMidis, clef, { keyName = null, spellings = null } = {}) {
  const midis = Array.isArray(targetMidis) ? targetMidis : [targetMidis];
  const container = document.getElementById('staff');
  container.innerHTML = '';

  const VF = Vex.Flow;
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(STAFF_WIDTH, STAFF_HEIGHT);
  const context = renderer.getContext();

  const trebleStave = new VF.Stave(10, 40, STAFF_WIDTH - 30).addClef('treble');
  const bassStave = new VF.Stave(10, 170, STAFF_WIDTH - 30).addClef('bass');
  if (keyName) {
    trebleStave.addKeySignature(keyName);
    bassStave.addKeySignature(keyName);
  }
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
  const keys = spellings ? spellings.map(formatVexKey) : midis.map((midi) => midiToVexKey(midi, midis));

  const note = new VF.StaveNote({ clef, keys, duration: 'w' });
  midis.forEach((midi, index) => {
    const accidental = spellings ? spellings[index].accidental : spellNote(midi, midis).accidental;
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
// The auto-advance timeout is tracked so the close button can cancel it and
// resolve immediately instead of waiting out the rest of INCORRECT_FEEDBACK_MS.
let correctiveFeedbackTimeout = null;

function showCorrectiveFeedback(midis) {
  const el = document.getElementById('corrective-feedback');
  const textEl = document.getElementById('corrective-feedback-text');
  // Reuses whatever spelling was already rendered for this attempt (see
  // showNextNote) rather than recomputing — a key-aware spelling can
  // involve a genuine coin flip, so recomputing here could name a
  // different spelling than the one actually shown on the staff.
  const spellings = session.current && session.current.spellings;
  const names = midis
    .map((midi, index) => (spellings ? formatDisplayName(spellings[index]) : midiToDisplayName(midi, midis)))
    .join(' + ');
  // Naming the interval type alongside the notes only applies to a
  // two-note chord target — a single note has no interval to name.
  const intervalSuffix = midis.length === 2 ? ` (${intervalNameFor(midis)})` : '';
  textEl.textContent = `That was ${names}${intervalSuffix}`;
  // Reset from a possible pause on a previous miss — there's a fresh
  // countdown to pause this time.
  document.getElementById('corrective-feedback-pause').classList.remove('hidden');
  el.classList.remove('hidden');
}

function hideCorrectiveFeedback() {
  document.getElementById('corrective-feedback').classList.add('hidden');
}

// Stops the countdown without closing the box or advancing — for reading
// the feedback for as long as needed on a touch device (no hover-to-pause
// available), rather than racing a fixed window. Hides the pause button
// itself afterward (nothing left to pause); the close button is still the
// only way to actually move on once paused.
function pauseCorrectiveFeedback() {
  if (!correctiveFeedbackTimeout) return;
  clearTimeout(correctiveFeedbackTimeout);
  correctiveFeedbackTimeout = null;
  document.getElementById('corrective-feedback-pause').classList.add('hidden');
}

// Lets the miss's auto-advance fire early (from the close button) instead
// of waiting out the rest of INCORRECT_FEEDBACK_MS — same resolution
// either way, just on demand rather than strictly on a timer. Guards on
// session.awaitingAdvance rather than the timeout handle, since a paused
// miss (see pauseCorrectiveFeedback) has already cleared the timeout but
// still needs to be dismissible.
function dismissCorrectiveFeedback() {
  if (!session.awaitingAdvance) return;
  if (correctiveFeedbackTimeout) {
    clearTimeout(correctiveFeedbackTimeout);
    correctiveFeedbackTimeout = null;
  }
  session.awaitingAdvance = false;
  advance();
}

// Shown near the staff whenever "Randomize key" picked one for the
// current attempt; hidden entirely otherwise (see "Key signatures" above).
function updateKeyDisplay(keyName) {
  const el = document.getElementById('key-display');
  if (!keyName) {
    el.classList.add('hidden');
    return;
  }
  el.textContent = keyDisplayName(keyName);
  el.classList.remove('hidden');
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
  const { presentedCount, firstTryCorrect, responseTimes, length } = session;
  document.getElementById('stat-attempts').textContent = `${presentedCount} / ${length}`;
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
  // Computed once here (not inside renderStaff) since it can involve a
  // genuine coin flip — corrective feedback later needs to name the exact
  // same spelling that was rendered, not a freshly re-rolled one.
  const spellings = item.key ? spellChordInKey(item.midis, item.key) : null;
  session.current = {
    midi: item.midi,
    midis: item.midis,
    clef,
    isFirstPresentation: item.isFirstPresentation,
    key: item.key || null,
    spellings,
  };
  if (item.isFirstPresentation) {
    session.presentedCount += 1;
  }
  session.noteStartTime = Date.now();
  hideCorrectiveFeedback();
  renderStaff(item.midis, clef, { keyName: item.key || null, spellings });
  updateKeyDisplay(item.key || null);
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
  document.getElementById('summary-heading').textContent =
    session.mode === 'drill' ? 'Weak-spot drill complete' : 'Session complete';
  document.getElementById('summary-correct').textContent = session.firstTryCorrect;
  document.getElementById('summary-total').textContent = session.length;
  document.getElementById('summary-avg-time').textContent = formatResponseTime(averageResponseTime(session.responseTimes));
  document.getElementById('staff-panel').classList.add('hidden');
  document.getElementById('stats-panel').classList.add('hidden');
  document.getElementById('summary-panel').classList.remove('hidden');
}

// mode: 'normal' picks a fresh weighted queue from the full range (see
// SPEC.md v6); 'drill' builds one from just the current weak spots (see
// "Drill my weak spots" above). "Play again" re-invokes whichever mode
// just finished (session.mode), so finishing a drill offers another drill
// rather than silently dropping back to a normal session.
function startSession(mode = 'normal') {
  const queue = mode === 'drill'
    ? buildDrillQueue(loadTroubleScores())
    : buildQueue(SESSION_LENGTH, {
        intervalMode: practiceOptions.interval,
        chromaticMode: practiceOptions.chromatic,
        randomizeKeyMode: practiceOptions.randomizeKey,
      });
  // Drill mode with no recorded trouble scores has nothing to queue. The
  // button that triggers this is disabled in that case (see
  // setDrillButtonAvailability), but guard here too rather than starting
  // a zero-length session if it's ever invoked another way.
  if (queue.length === 0) return;

  // Starting a session while a previous miss's corrective feedback is
  // still showing would otherwise leave its auto-advance timer dangling —
  // it'd fire later and call advance() against this new session's state,
  // silently skipping a note.
  if (correctiveFeedbackTimeout) {
    clearTimeout(correctiveFeedbackTimeout);
    correctiveFeedbackTimeout = null;
  }

  session.queue = queue;
  session.length = queue.length;
  session.mode = mode;
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
    requeue(session.current.midis, session.queue, session.current.key);
    recordAttemptOutcome(session.current.midis, false);
    session.awaitingAdvance = true;
    correctiveFeedbackTimeout = setTimeout(() => {
      correctiveFeedbackTimeout = null;
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
const practiceOptions = { chromatic: false, interval: false, randomizeKey: false };

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

// Disabled until at least one trouble score exists (see "Drill my weak
// spots" above) — there's nothing to build a drill queue from otherwise.
// Called on boot and after every recordAttemptOutcome, so it stays in
// sync with scores changing during live play, not just at session start.
function setDrillButtonAvailability(hasWeakSpots) {
  const btn = document.getElementById('drill-weak-spots-btn');
  btn.disabled = !hasWeakSpots;
  btn.title = hasWeakSpots ? '' : 'No trouble spots recorded yet — play a session first';
}

// The virtual piano is a single pointer/finger — it can only tap one key
// at a time, unlike a real piano where both notes of a chord are struck
// together. onNoteOn has no timing requirement (see "still needed"
// pending-notes set below), so two sequential taps already resolve an
// interval target correctly; this hint just makes that discoverable
// rather than leaving it to be figured out by trial and error.
//
// Dismissing it (the close button) is a lightweight "I've got it, stop
// taking up space" — not persisted across reloads, since it only ever
// shows up while interval mode is checked, and re-checking interval mode
// after a reload is a fine trigger to show it again.
let intervalHintDismissed = false;

function updateIntervalPianoHint() {
  const shouldShow = practiceOptions.interval && !intervalHintDismissed;
  document.getElementById('interval-piano-hint').classList.toggle('hidden', !shouldShow);
}

function initPracticeOptions() {
  document.getElementById('chromatic-toggle').addEventListener('change', (event) => {
    practiceOptions.chromatic = event.target.checked;
  });
  document.getElementById('interval-toggle').addEventListener('change', (event) => {
    practiceOptions.interval = event.target.checked;
    updateChromaticCheckboxState();
    updateIntervalPianoHint();
  });
  document.getElementById('randomize-key-toggle').addEventListener('change', (event) => {
    practiceOptions.randomizeKey = event.target.checked;
  });
  document.getElementById('interval-piano-hint-close').addEventListener('click', () => {
    intervalHintDismissed = true;
    updateIntervalPianoHint();
  });
  document.getElementById('corrective-feedback-pause').addEventListener('click', pauseCorrectiveFeedback);
  document.getElementById('corrective-feedback-close').addEventListener('click', dismissCorrectiveFeedback);
  document.getElementById('start-session-btn').addEventListener('click', () => startSession('normal'));
  document.getElementById('drill-weak-spots-btn').addEventListener('click', () => startSession('drill'));
  setDrillButtonAvailability(Object.keys(loadTroubleScores()).length > 0);
}

// --- Boot ---------------------------------------------------------
// No startSession() call here — the app starts idle (see #idle-panel in
// index.html). session.current stays null until the user explicitly
// clicks "Start new session", and onNoteOn's existing guard clause
// (`!session.current`) already no-ops any note input — MIDI or the
// on-screen piano — until then, so nothing extra is needed there.
document.getElementById('play-again-btn').addEventListener('click', () => startSession(session.mode));
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
  buildDrillQueue,
  parseTroubleKey,
  intervalNameFor,
  dismissCorrectiveFeedback,
  pauseCorrectiveFeedback,
  KEY_NAMES,
  KEY_SIGNATURE_INFO,
  RELATIVE_MINOR_NAME,
  keyDisplayName,
  pickRandomKey,
  spellInKey,
  spellNoteForKey,
  spellChordInKey,
  buildQueue,
  formatVexKey,
  formatDisplayName,
};
