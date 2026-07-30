# PrimaVista — MVP Spec

## One-line description
A minimal web app that trains note-reading speed by rendering one random note on a staff and waiting for the user to play the matching pitch on a connected MIDI piano.

## Goal of the MVP
Isolate the single smallest skill in sight-reading: seeing a note (including ledger lines) and finding it on the keyboard immediately, without pattern recognition (scales, key signatures, intervals). No accidentals, no rhythm, no chords — those are explicitly out of scope for v1 and will be added later.

## Core loop
1. App generates a random pitch within a fixed range.
2. App renders that single note on a grand staff (treble + bass, auto-selecting the correct clef based on pitch).
3. App waits for MIDI input.
4. On note-on event:
   - If pitch matches → brief visual "correct" feedback (e.g. green flash), log response time, generate next note.
   - If pitch does not match → brief visual "incorrect" feedback (e.g. red flash), log the miss, keep waiting for the correct note (so the user must self-correct before moving on).
5. Repeat indefinitely until user stops.

## Explicit non-goals for v1 (deliberately deferred)
- No accidentals (sharps/flats) — natural notes only (A–G).
- No key signatures. (basically meaning either C major or A minor all the time)
- No rhythm/timing beyond simple response-time logging.
- No chords — single notes only.
- No 8va/15ma notation — pitch range is capped to avoid needing it (see below).
- No software/on-screen piano fallback — MIDI input only.
- No user accounts, no backend, no persistence beyond the current browser session.

## Pitch range
**C2 to C7** (5 octaves). Covers the practical range of Baroque and Romantic piano literature without triggering the need for 8va/15ma notation. Should be defined as two constants (`MIN_MIDI_NOTE`, `MAX_MIDI_NOTE`) so it's trivial to adjust later.

## Tech stack
- **Notation rendering:** VexFlow (renders single notes + ledger lines on a grand staff; clef selection logic needs to be handled manually — see below).
- **MIDI input:** Web MIDI API, listening for `noteon` events from any connected MIDI device.
- **No backend.** Single-page app, static HTML/JS, no build step required for v1 unless convenient.
- **No framework required** for v1 — plain JS is enough given the small scope. (Optional: React if it makes iteration easier later.)

## Clef selection logic
Since only one note is shown at a time, pick the clef per-note:
- MIDI note ≥ 60 (middle C) → treble clef.
- MIDI note < 60 → bass clef.
- (This creates a visible "jump" between clefs as random notes land above/below middle C — that's fine and arguably useful for v1, since clef-switching recognition is itself part of sight-reading.)

## Feedback & stats (minimal for v1)
- Visual correct/incorrect flash per attempt.
- Running session count: notes attempted, notes correct on first try, average response time.
- Displayed simply on-screen (no charts, no persistence) — just enough to see immediate progress within a session.

## Out of scope for v1 but worth noting in code structure
(So the MVP can be extended without a rewrite.)
- Accidentals: will require tracking "measure state" (a note stays altered until the next bar) — noted as a known future complexity, not built now.
- Weighted randomization (favor problem notes/ledger-line-heavy notes based on past misses) — requires persistence, deferred.
- 8va/15ma rendering logic if range is ever extended beyond C2–C7.
- On-screen piano widget as a fallback for users without a MIDI device.

## Definition of done for v1
- App loads in browser, requests MIDI access.
- User can select their MIDI input device if multiple are connected.
- A random note renders correctly on the correct clef with correct ledger lines.
- Playing the correct key advances to a new random note.
- Playing an incorrect key gives visible feedback and does not advance.
- Session stats (attempts, correct, avg response time) are visible and update live.