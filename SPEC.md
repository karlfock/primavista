# PrimaVista — Spec

## One-line description
A minimal web app that trains note-reading speed by rendering one random note on a staff and waiting for the user to play the matching pitch on a connected MIDI piano.

## Status
- **v1 (shipped):** core loop working — random natural note, correct/incorrect feedback, session stats. Deployed at https://primavista-zeta.vercel.app/
- **v2 (shipped):** extended pitch range, clef-ambiguity handling for notes near the staff boundary.
- **v3 (shipped):** fixed-length sessions, single-attempt notes with corrective feedback, re-queueing of missed notes.
- **v4 (shipped):** iOS Web MIDI compatibility hardening, on-screen virtual piano.
- **v5 (this update):** chromatic notes and interval (chord) practice mode.
## Core loop (v3 change)
1. App generates a random pitch within the configured range.
2. App renders that single note on a grand staff, selecting a clef per the rules below.
3. App waits for MIDI input.
4. On note-on event — **single attempt per note**:
   - If pitch matches → brief visual "correct" feedback (e.g. green flash), log response time, generate next note. **No note name is shown on success** — the memory benefit comes from the retrieval itself, and the goal is a direct notation → key mapping without a verbal intermediate step.
   - If pitch does not match → brief visual "incorrect" feedback (e.g. red flash), log the miss, then **show the correct note name ** as corrective feedback before moving on to the next note. The missed note is **re-queued** to reappear later in the same session.
5. Repeat until the session is complete (see Sessions below).

### v1/v2 behavior (being replaced)
Previously the app kept waiting after a wrong answer until the correct note was played, and ran indefinitely. This is replaced because unlimited attempts invite lazy cluster-clicking (guessing instead of retrieval), which removes the learning effect.

## Sessions (v3 change)
- A session is a fixed set of **25 notes**. A few minutes long — short enough to do daily, long enough for missed notes to come back a couple of times within the same session.
- Missed notes are re-queued later in the session until answered correctly (re-queued appearances don't count toward the 25).
- At the end, a **session summary** is shown (e.g. "22/25 correct on first try", average response time), giving a natural sense of completion and something to beat next time.
## Explicit non-goals (still deferred, unchanged from v1 unless noted)
- ~~No accidentals (sharps/flats) — natural notes only (A–G).~~ **Superseded in v5** — see Chromatic notes & interval mode below. Still no key signature (stays "in C").
- No key signatures — everything reads as if in C major / A minor.
- No rhythm/timing beyond simple response-time logging.
- ~~No chords — single notes only.~~ **Superseded in v5** for interval mode specifically — see below. Plain single-note mode is unaffected and remains the default.
- No 8va/15ma notation.
- ~~No software/on-screen piano fallback — MIDI input only.~~ **Superseded in v4** — see Virtual piano below.
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

## Feedback & stats (v3 change)
- Visual correct/incorrect flash per attempt.
- On misses only: correct note name shown as corrective feedback.
- Running session count: notes attempted, notes correct on first try, average response time.
- End-of-session summary screen (see Sessions above).
- Displayed simply on-screen (no charts, no persistence).
## Out of scope but worth noting in code structure (unchanged from v1 unless noted)
- Accidentals: requires tracking "measure state" (a note stays altered until the next bar).
- Weighted randomization (favor problem notes/ledger-line-heavy notes based on past misses) — requires persistence.
- 8va/15ma rendering logic if range is ever extended beyond A0–C7.
- ~~On-screen piano widget as a fallback for users without a MIDI device.~~ **Shipped in v4.**
- Randomized key signatures, once accidentals are supported.
## Definition of done for v3
- Sessions are 25 notes long and end with a summary (first-try score, average response time).
- Exactly one attempt per note; a wrong answer shows the correct note name/key and advances.
- Missed notes reappear later in the same session until answered correctly.
- No note name is shown after correct answers.
- All v1/v2 definition-of-done items continue to hold (MIDI device selection, extended A0–C7 range, clef-ambiguity zone, clef-relative ledger lines, live session stats).

## iOS Web MIDI compatibility (v4 change)
Safari and WKWebView have no Web MIDI API support at all, on macOS or iOS — Apple has not shipped it (fingerprinting concerns are the cited reason). The only way to get MIDI input on iOS is a third-party browser app that bridges `navigator.requestMIDIAccess` to native Core MIDI (e.g. "Web MIDI Browser" or the newer "MIDIWeb Browser", which also adds bookmarking that the older app lacks). These shims are frequently spec-incomplete in ways that don't show up on desktop Chrome/Firefox, since those are the only implementations most Web MIDI code is ever tested against:
- `MIDIInputMap.values()` may not return a spec-compliant iterator — `Array.from(midiAccess.inputs.values())` can throw. Use `forEach` instead, which every implementation supports.
- Assigning `input.onmidimessage = handler` can silently no-op if the shim implements `EventTarget.addEventListener` but never wires up the `onmidimessage` property reflection. Use `addEventListener('midimessage', handler)` instead.
- Assigning `midiAccess.onstatechange = handler` can throw if the shim's setter is buggy. Isolate that assignment in its own try/catch so a failure there can't be mistaken for the outer `requestMIDIAccess()` call failing (an unguarded throw here previously surfaced as a false "MIDI access denied" status even when a device was already connected and working).
- Re-requesting `requestMIDIAccess()` a second time (e.g. to recover from a late-connecting device) is not reliable on these shims and can fail even after an earlier call succeeded. Re-poll the already-granted `MIDIAccess` object instead of calling `requestMIDIAccess()` again.

None of this is testable against a real iOS device from this environment, so `tests/app.spec.js` covers it with mocked `MIDIAccess`/`MIDIInput` objects that reproduce each specific shim quirk (non-iterable `.values()`, inert `.onmidimessage`, throwing `.onstatechange` setter, a failing second `requestMIDIAccess()` call).

## Virtual piano (v4 change)
An on-screen piano keyboard, usable with no MIDI device connected at all:
- Renders the **full 88-key range (A0–C8)**, not just the app's A0–C7 quiz range — the top octave (C#7–C8) can never be a correct answer, but it's included for visual fidelity to a real piano.
- Keys call `onNoteOn(midiNote)` directly, bypassing MIDI entirely — correct/incorrect handling, feedback, and stats are identical whether the note came from a real keyboard or a tap.
- **Desktop:** breaks out of the app's normal 640px-wide centered column to use the full window width; key width is computed from the available viewport width so all 88 keys fit with no horizontal scrollbar. Recomputes on window resize.
- **Mobile/narrow viewports:** key width hits a fixed floor and the keyboard scrolls horizontally — accepted rather than shrinking keys to the point of being unusable.

## Definition of done for v4
- MIDI device selection, connection, and note input work through the third-party iOS Web MIDI shims described above (not just desktop Chrome/Firefox), including recovery from a late-connecting device without a false "access denied" status.
- An on-screen piano (A0–C8) is available and fully usable without any MIDI device connected.
- On desktop, the piano uses the full window width with no scrolling; on narrow viewports it scrolls.
- All v1/v2/v3 definition-of-done items continue to hold.

## Chromatic notes & interval mode (v5 change)
Two independent toggles, both off by default (default behavior is unchanged from v4):

- **Chromatic notes:** single-note mode draws from all 12 pitch classes in the A0–C7 range instead of just naturals. Still "in C" — no key signature, so accidentals appear ad hoc rather than implied by a key.
- **Interval mode:** each target becomes a **two-note chord** — a random true chromatic interval (1–12 semitones, minor 2nd through octave) rather than a diatonic/staff-distance interval. A diatonic-only approach was considered and rejected: it can't guarantee an exact interval quality using only natural notes (there's no natural note a minor third above C), and a fixed/predictable interval type defeats the point of the drill (you'd learn to read one note and apply a memorized offset instead of actually judging the gap between two notes).

Both notes of an interval can be anywhere in the chromatic range (not just naturals) — this is why chromatic-note spelling/rendering is shared infrastructure between the two toggles rather than being interval-specific.

**Spelling:** always sharps, never flats (`PITCH_CLASS_SPELLING` in `app.js`). With no key signature or tonal context, there's no principled basis to choose flat spelling for some notes and sharp for others, so picking one consistent spelling avoids that decision entirely.

**Matching logic:** generalizes the existing single-attempt rule via a "still needed" pending-notes set on the current target. Any note-on that isn't one of the target's remaining notes is an immediate miss (same single-attempt philosophy as v3); a correct note-on removes it from the pending set; the attempt resolves as correct only once the set is empty. Order doesn't matter for a chord. For a single-note target this is exactly the old one-note-on-resolves-immediately behavior — the generalization is behavior-preserving when there's only one target note.

**Explicitly deferred (see `BACKLOG.md`):** restricting practice to specific interval types (currently every interval 1–12 semitones is equally likely, no way to select a subset), melodic mode (notes played in sequence rather than together, with randomized direction), and mixing interval/chromatic presentations with plain single notes within one session (currently each toggle applies to the whole session).

## Definition of done for v5
- With both toggles off, behavior is unchanged from v4 (single natural-note targets).
- "Chromatic notes" checked: single-note targets can be any of the 12 pitch classes, correctly notated with sharps where needed.
- "Interval mode" checked: each target is a random two-note chord 1–12 semitones apart, rendered as a stacked chord (VexFlow handles second-interval notehead offsetting automatically); both notes must be played (order-independent) to advance; any other note-on is an immediate miss showing both target note names.
- All v1/v2/v3/v4 definition-of-done items continue to hold.