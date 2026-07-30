# PrimaVista — Spec

## One-line description
A minimal web app that trains note-reading speed by rendering one random note on a staff and waiting for the user to play the matching pitch on a connected MIDI piano.

## Status
- **v1 (shipped):** core loop working — random natural note, correct/incorrect feedback, session stats. Deployed at https://primavista-zeta.vercel.app/
- **v2 (this update):** extended pitch range, clef-ambiguity handling for notes near the staff boundary.
## Core loop
1. App generates a random pitch within the configured range.
2. App renders that single note on a grand staff, selecting a clef per the rules below.
3. App waits for MIDI input.
4. On note-on event:
   - If pitch matches → brief visual "correct" feedback (e.g. green flash), log response time, generate next note.
   - If pitch does not match → brief visual "incorrect" feedback (e.g. red flash), log the miss, keep waiting for the correct note (so the user must self-correct before moving on).
5. Repeat indefinitely until user stops.
## Explicit non-goals (still deferred, unchanged from v1)
- No accidentals (sharps/flats) — natural notes only (A–G).
- No key signatures — everything reads as if in C major / A minor.
- No rhythm/timing beyond simple response-time logging.
- No chords — single notes only.
- No 8va/15ma notation.
- No software/on-screen piano fallback — MIDI input only.
- No user accounts, no backend, no persistence beyond the current browser session.
## Pitch range (v2 change)
Extended at the bottom, unchanged at the top:

```javascript
const MIN_MIDI_NOTE = 21; // A0 — lowest note on a standard piano
const MAX_MIDI_NOTE = 96; // C7 — unchanged from v1
const MIDDLE_C = 60;
```

Rationale: the v1 range (C2–C7) was not symmetric relative to the real keyboard — the low end sat over an octave above the piano's actual lowest note, while the high end sat only an octave below the highest. Extending down to A0 covers the practical range used in Busoni's and Siloti's Bach transcriptions, which go well below anything in Bach's own keyboard writing. The top end stays at C7 since very high writing remains comparatively rare and 8va/15ma notation is still out of scope.

## Clef selection logic (v2 change)

### v1 behavior (naive, being replaced)
Clef was chosen purely by pitch: MIDI ≥ 60 → treble, otherwise → bass. This meant a note could never appear "displaced" into the clef where it doesn't naturally belong — even though real notation frequently does this to avoid clef-switching within a single voice (e.g. a written E that would sit just below the treble staff, shown with ledger lines in treble rather than jumping to bass, because the surrounding notes in that voice belong in treble).

### v2 behavior
Introduce an **ambiguity zone** around the middle of the keyboard — roughly C3 to C5 (MIDI 48–72) — where either clef is notationally reasonable:

- **Outside the ambiguity zone** (very low or very high notes): clef is forced as before (low → bass, high → treble), since it would be unrealistic to notate an extreme Busoni-low note in the treble staff.
- **Inside the ambiguity zone**: clef is chosen at random per note, independent of pitch. This lets a note like E4 sometimes render in bass (with ledger lines above the staff) and sometimes in treble (with ledger lines below the staff) — training exactly the "ledger-line-heavy note in the 'wrong' clef" pattern the user struggles with in real repertoire.
### Ledger line calculation
Ledger line count/position must be calculated **relative to the chosen clef**, not relative to absolute pitch. This is a structural change from v1, where clef and ledger-line logic were effectively the same calculation (since clef was pitch-derived). In v2 they become two separate steps:
1. Choose clef (per rules above).
2. Given (pitch, chosen clef), compute ledger lines needed to render that pitch on that clef.
Suggested implementation shape:
```javascript
function chooseClef(midiNote) {
  const AMBIGUITY_LOW = 48;  // C3
  const AMBIGUITY_HIGH = 72; // C5
  if (midiNote < AMBIGUITY_LOW) return 'bass';
  if (midiNote > AMBIGUITY_HIGH) return 'treble';
  return Math.random() < 0.5 ? 'treble' : 'bass';
}
```
Ledger-line rendering (via VexFlow) then keys off `(midiNote, clef)` as a pair rather than off `midiNote` alone.

## Feedback & stats (unchanged from v1)
- Visual correct/incorrect flash per attempt.
- Running session count: notes attempted, notes correct on first try, average response time.
- Displayed simply on-screen (no charts, no persistence).
## Out of scope but worth noting in code structure (unchanged from v1, still deferred)
- Accidentals: requires tracking "measure state" (a note stays altered until the next bar).
- Weighted randomization (favor problem notes/ledger-line-heavy notes based on past misses) — requires persistence.
- 8va/15ma rendering logic if range is ever extended beyond A0–C7.
- On-screen piano widget as a fallback for users without a MIDI device.
- Randomized key signatures, once accidentals are supported.
## Definition of done for v2
- Pitch range extended to A0–C7; lowest notes now reach the actual bottom of the keyboard.
- Notes within the C3–C5 ambiguity zone appear in either clef at random, not just their "default" clef.
- Ledger lines render correctly relative to whichever clef was chosen, including cases where a note sits many ledger lines away from its non-default clef.
- All v1 definition-of-done items continue to hold (MIDI device selection, correct/incorrect feedback, live session stats).