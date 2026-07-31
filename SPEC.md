# PrimaVista — Spec

## One-line description
A minimal web app that trains note-reading speed by rendering one random note on a staff and waiting for the user to play the matching pitch on a connected MIDI piano.

## Status
- **v1 (shipped):** core loop working — random natural note, correct/incorrect feedback, session stats. Deployed at https://primavista-zeta.vercel.app/
- **v2 (shipped):** extended pitch range, clef-ambiguity handling for notes near the staff boundary.
- **v3 (shipped):** fixed-length sessions, single-attempt notes with corrective feedback, re-queueing of missed notes.
- **v4 (shipped):** iOS Web MIDI compatibility hardening, on-screen virtual piano.
- **v5 (shipped):** chromatic notes and interval (chord) practice mode.
- **v6 (this update):** weighted note selection based on historical misses.
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
- ~~No user accounts, no backend, no persistence beyond the current browser session.~~ **Partially superseded in v6** — per-note/per-interval trouble scores now persist in `localStorage` across sessions (see Weighted note selection below). Still true in every other respect: no accounts, no backend, no server-side data, nothing that syncs across devices or survives clearing browser data.
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

**Applying changes:** checking a box only updates the setting — it does not restart whatever session is in progress. A separate **"Start new session"** button applies the current settings explicitly. This is deliberate: a checkbox silently discarding an in-progress session as a side effect was confusing, so starting a session (with whatever settings are currently set) is always its own explicit action, never an implicit consequence of changing a setting.

This extends to the very first session too: the app now loads into an **idle state** (`#idle-panel`) rather than auto-starting — no note shown, no live stats, and no note input (MIDI or the on-screen piano) does anything at all (`session.current` stays `null`, and `onNoteOn`'s existing guard clause already no-ops on that) until "Start new session" is clicked for the first time. Choosing practice settings and then explicitly starting is the same flow whether it's the first session or the fifth.

**Chromatic notes ↔ Interval mode dependency:** interval mode always uses the full chromatic range for both notes regardless of the "Chromatic notes" checkbox (see rationale above) — so while interval mode is checked, the "Chromatic notes" checkbox displays as checked and disabled rather than looking inert/disconnected from what's actually happening. Unchecking interval mode restores the user's own prior chromatic preference (not just resetting to unchecked).

**Spelling:** always sharps, never flats (`PITCH_CLASS_SPELLING` in `app.js`), *except* for one specific correction within a chord. With no key signature or tonal context, there's no principled basis to choose flat spelling for some notes and sharp for others, so picking one consistent spelling avoids that decision entirely — but a minor-second chord can land on a natural and its own sharp (e.g. F and F#), which under always-sharp spelling means two same-letter noteheads distinguished only by an accidental. That's ambiguous/incorrect notation (an accidental is understood to apply to every note of that letter+octave for the rest of the measure), so the sharp note is respelled as the enharmonic flat of the next letter instead (F# -> Gb) whenever its natural neighbor is also in the same chord (`SHARP_TO_FLAT_RESPELLING` in `app.js`). This only ever fires for a minor second landing on one of 5 specific pitch-class pairs (C/C#, D/D#, F/F#, G/G#, A/A#) — every other interval size and every single-note presentation is unaffected.

**Matching logic:** generalizes the existing single-attempt rule via a "still needed" pending-notes set on the current target. Any note-on that isn't one of the target's remaining notes is an immediate miss (same single-attempt philosophy as v3); a correct note-on removes it from the pending set; the attempt resolves as correct only once the set is empty. Order doesn't matter for a chord. For a single-note target this is exactly the old one-note-on-resolves-immediately behavior — the generalization is behavior-preserving when there's only one target note.

**Every interval type is always equally likely, by design** — narrowing practice to a subset of interval types (e.g. "only fourths and fifths") was considered and rejected: even a curated subset shrinks the guessing space enough to start pattern-matching "it's probably one of these" instead of actually judging the two-note gap, the same problem as a single fixed interval, just diluted. This isn't expected to change.

**Explicitly deferred (see `BACKLOG.md`):** melodic mode (notes played in sequence rather than together, with randomized direction), and mixing interval/chromatic presentations with plain single notes within one session (currently each toggle applies to the whole session).

## Definition of done for v5
- With both toggles off, behavior is unchanged from v4 (single natural-note targets).
- "Chromatic notes" checked: single-note targets can be any of the 12 pitch classes, correctly notated with sharps where needed.
- "Interval mode" checked: each target is a random two-note chord 1–12 semitones apart, rendered as a stacked chord (VexFlow handles second-interval notehead offsetting automatically); both notes must be played (order-independent) to advance; any other note-on is an immediate miss showing both target note names.
- A minor-second chord landing on a natural + its own sharp (e.g. F + F#) is respelled so the sharp note uses the enharmonic flat of the next letter (Gb, not F#), avoiding two same-letter noteheads distinguished only by an accidental — both the staff notation and the corrective-feedback text reflect the same respelling.
- Checking/unchecking either box never alters the session already in progress; a "Start new session" button applies the current settings explicitly.
- While interval mode is checked, "Chromatic notes" shows as checked and disabled; unchecking interval mode restores whatever the user had it set to before.
- On page load, the app is idle: no note is shown, stats/staff panels are hidden, and no note input (MIDI or on-screen piano) has any effect until "Start new session" is clicked.
- All v1/v2/v3/v4 definition-of-done items continue to hold.

## Weighted note selection based on historical misses (v6 change)

Every note and every interval pair has a **trouble score** persisted in `localStorage` (key `primavista:troubleScores`), starting implicitly at 0:

- A miss: `+1`.
- A correct answer: `-1`, floored at 0. Once a score returns to exactly 0, its entry is deleted from storage entirely rather than kept as an explicit zero — cleanup, and also means "mastered" items are indistinguishable from items never seen, which is the intent.
- Selection weight for a candidate is `1 + troubleScore`, so something missed 3 times is 4x as likely to be picked as something never missed. With no scores at all (a fresh browser, or everything at baseline), every candidate has weight 1 and selection is uniform — identical to pre-v6 behavior.

**No time-based decay.** A score only goes down by answering that item correctly again — never automatically over calendar time. This was a deliberate simplification: it needs no timestamps, and "you stopped seeing it as often because you got better at it" is a more meaningful trigger than "you stopped seeing it because enough days passed."

**Interval items are keyed by the exact pair** (e.g. `i:65-66`), not by interval type (e.g. "minor 2nd"). Weighting by type would bias toward showing more of whichever type is generally weak, which edges back toward the predictability problem interval mode's design deliberately avoids (see v5 above — a foreseeable interval type lets you read one note and infer the other instead of judging the actual gap). Keying on the specific pair targets real weak spots without making the type itself predictable. One consequence: the interval-pair space is much larger (~800+ possible pairs within A0–C7) than the single-note space (~45–76 depending on chromatic mode), so it takes more repetitions before weighting has a noticeable effect on intervals than on single notes — an inherent tradeoff, not a bug.

**Implementation:** `pickIntervalPair()` changed from a generate-and-retry loop to enumerating every valid `(low, high)` pair once (`INTERVAL_CANDIDATES`) and doing a weighted pick over the full list — simpler to weight correctly than trying to bias a retry loop. `buildQueue()` reads `localStorage` once per session (not once per note) and threads the scores through to each pick call. Scores are updated in `onNoteOn` on every fully-resolved attempt (a genuine miss, or a chord's final correct note) — not on a chord's partial hits along the way.

**Resilience:** `localStorage` reads/writes are wrapped in try/catch (private browsing, disabled storage, quota limits can all throw) and fail silently, falling back to unweighted selection rather than breaking the app.

## Definition of done for v6
- A note or interval pair missed more often is proportionally more likely to be selected in future sessions, including sessions started after a page reload (scores persist in `localStorage`).
- A trouble score returns toward baseline (and is deleted once at 0) as the user answers that item correctly again — never through the mere passage of time.
- Interval trouble scores are tracked per exact pair, not per interval type, so interval *type* remains as unpredictable as in v5.
- With no browsing history (or a `localStorage` read/write failure), selection is unweighted/uniform, identical to v5 behavior.
- All v1–v5 definition-of-done items continue to hold.