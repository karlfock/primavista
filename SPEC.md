# PrimaVista — Spec

## One-line description
A minimal web app that trains note-reading speed by rendering one random note on a staff and waiting for the user to play the matching pitch on a connected MIDI piano.

## Status
- **v1 (shipped):** core loop working — random natural note, correct/incorrect feedback, session stats. Deployed at https://primavista-zeta.vercel.app/
- **v2 (shipped):** extended pitch range, clef-ambiguity handling for notes near the staff boundary.
- **v3 (shipped):** fixed-length sessions, single-attempt notes with corrective feedback, re-queueing of missed notes.
- **v4 (shipped):** iOS Web MIDI compatibility hardening, on-screen virtual piano.
- **v5 (shipped):** chromatic notes and interval (chord) practice mode.
- **v6 (shipped):** weighted note selection based on historical misses.
- **v7 (shipped):** "Drill my weak spots" session mode built directly on the trouble-score data.
- **v8 (shipped):** interval type named in corrective feedback; corrective feedback window doubled; a hint for entering interval-mode chords on the virtual piano.
- **v9 (shipped):** corrective feedback window extended to 10s but made closable early; the interval-mode piano hint is also closable.
- **v10 (shipped):** corrective feedback also gets a pause button, for reading it at your own pace instead of racing a countdown.
- **v11 (shipped):** "Randomize key" mode — each attempt can be spelled and rendered against one of the 15 standard key signatures instead of always assuming C major/A minor.
- **v12 (shipped):** the app displays its own version number in the footer.
- **v13 (shipped):** a correct interval-mode attempt briefly names the interval type; the corrective-feedback pause/close buttons are bigger, easier to tell apart on a touchscreen.
- **v14 (shipped):** the corrective-feedback (miss) alert moved from top-center to top-right, matching the correct-interval-name box, so it no longer covers the clef/notes on the staff (BACKLOG.md #12).
- **v15 (this update):** every note/interval shown on the staff is now also labeled with its Swedish octave name(s), discreetly in the bottom-left corner of the staff panel (BACKLOG.md #11).
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
- ~~No accidentals (sharps/flats) — natural notes only (A–G).~~ **Superseded in v5** — see Chromatic notes & interval mode below.
- ~~No key signatures — everything reads as if in C major / A minor.~~ **Superseded in v11** — see "Randomize key" mode below. This is opt-in (a checkbox, off by default); with it off, the app still reads exactly as if in C major/A minor, unchanged.
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
- ~~Weighted randomization (favor problem notes/ledger-line-heavy notes based on past misses) — requires persistence.~~ **Shipped in v6** (weighting) and taken further in v7 (isolation drilling — see "Drill my weak spots" above).
- 8va/15ma rendering logic if range is ever extended beyond A0–C7.
- ~~On-screen piano widget as a fallback for users without a MIDI device.~~ **Shipped in v4.**
- ~~Randomized key signatures, once accidentals are supported.~~ **Shipped in v11** — see "Randomize key" mode below.
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

- A miss: `+1` (`MISS_TROUBLE_DELTA`).
- A correct answer: `-0.5` (`CORRECT_TROUBLE_DELTA`), floored at 0. Once a score returns to 0 or below, its entry is deleted from storage entirely rather than kept as an explicit zero — cleanup, and also means "mastered" items are indistinguishable from items never seen, which is the intent.
- Selection weight for a candidate is `1 + troubleScore`, so something missed 3 times is 4x as likely to be picked as something never missed. With no scores at all (a fresh browser, or everything at baseline), every candidate has weight 1 and selection is uniform — identical to pre-v6 behavior.

**The reward is deliberately smaller than the penalty (2 corrects to offset 1 miss), not symmetric.** A session never ends until every note has been re-queued until answered correctly (v3), so a single miss is *guaranteed* an eventual same-session correct answer. With a symmetric ±1, that guaranteed redemption would guarantee a net-zero score by the time a session ends — confirmed in real use, where two full sessions left almost nothing in `localStorage`. The asymmetry means genuinely hard items keep some elevated weight past their first same-session retry, carrying real signal into future sessions instead of the app's own re-queue mechanic silently erasing it.

**No time-based decay.** A score only goes down by answering that item correctly again — never automatically over calendar time. This was a deliberate simplification: it needs no timestamps, and "you stopped seeing it as often because you got better at it" is a more meaningful trigger than "you stopped seeing it because enough days passed."

**Interval items are keyed by the exact pair** (e.g. `i:65-66`), not by interval type (e.g. "minor 2nd"). Weighting by type would bias toward showing more of whichever type is generally weak, which edges back toward the predictability problem interval mode's design deliberately avoids (see v5 above — a foreseeable interval type lets you read one note and infer the other instead of judging the actual gap). Keying on the specific pair targets real weak spots without making the type itself predictable. One consequence: the interval-pair space is much larger (~800+ possible pairs within A0–C7) than the single-note space (~45–76 depending on chromatic mode), so it takes more repetitions before weighting has a noticeable effect on intervals than on single notes — an inherent tradeoff, not a bug.

**Implementation:** `pickIntervalPair()` changed from a generate-and-retry loop to enumerating every valid `(low, high)` pair once (`INTERVAL_CANDIDATES`) and doing a weighted pick over the full list — simpler to weight correctly than trying to bias a retry loop. `buildQueue()` reads `localStorage` once per session (not once per note) and threads the scores through to each pick call. Scores are updated in `onNoteOn` on every fully-resolved attempt (a genuine miss, or a chord's final correct note) — not on a chord's partial hits along the way.

**Resilience:** `localStorage` reads/writes are wrapped in try/catch (private browsing, disabled storage, quota limits can all throw) and fail silently, falling back to unweighted selection rather than breaking the app.

## Definition of done for v6
- A note or interval pair missed more often is proportionally more likely to be selected in future sessions, including sessions started after a page reload (scores persist in `localStorage`).
- A trouble score returns toward baseline (and is deleted once at 0) as the user answers that item correctly again — never through the mere passage of time.
- A single miss followed by a single correct answer (the guaranteed same-session re-queue redemption) does not fully clear a trouble score — it takes a second correct answer to fully offset one miss.
- Interval trouble scores are tracked per exact pair, not per interval type, so interval *type* remains as unpredictable as in v5.
- With no browsing history (or a `localStorage` read/write failure), selection is unweighted/uniform, identical to v5 behavior.
- All v1–v5 definition-of-done items continue to hold.

## "Drill my weak spots" session mode (v7 change)

A second session-starting action, alongside "Start new session": a **"Drill my weak spots"** button in the practice-options bar, disabled whenever there are no recorded trouble scores.

Where v6 only *biases* the normal mixed session toward hard items (still drawn from the full range, just weighted), this mode builds a session **entirely** from the current highest-scoring notes/intervals — real isolation practice on exactly what's difficult right now, not diluted into a mostly-easy session.

- **Selection:** every key currently in `localStorage`'s trouble-score map (both `n:` note keys and `i:` interval-pair keys) is a candidate, sorted by score descending, capped at the same length as a normal session (`SESSION_LENGTH` — reused rather than introducing a second, separate limit; with fewer weak spots than that, the session is simply shorter, which is what makes it "short" without needing its own cap). Presentation order is shuffled once up front so the single worst item doesn't always land first.
- **No new mechanic for "practiced until they clear":** a drill session reuses the existing single-attempt + requeue-until-correct loop unchanged (see Core loop above) — restricting the queue to just the weak items is the whole feature. A miss still requeues at a random later position and still updates the trouble score exactly as it would in a normal session, so playing a drill session continues to refine the same data it was built from.
- **Session length is dynamic**, not the fixed 25: `stat-attempts` and the summary screen both show "n / (however many weak spots were drilled)" rather than always "/ 25". The summary heading also reads "Weak-spot drill complete" instead of "Session complete" so it's clear which kind of session just finished.
- **"Play again" repeats the mode that just finished** — finishing a drill offers another drill (rebuilt from current scores, which may have shifted during play), finishing a normal session offers another normal session. The practice-option checkboxes (chromatic notes / interval mode) don't apply to drill sessions — a drill item's shape (single note vs. two-note chord) is already fixed by which kind of item it was when it built up its trouble score.
- **Button availability** reacts live to trouble-score changes during play (not just at session start/end), since a miss recorded mid-session can create the first-ever weak spot and should make the button usable without a reload.

## Definition of done for v7
- "Drill my weak spots" is disabled with zero recorded trouble scores and becomes enabled as soon as one is recorded (including mid-session).
- Clicking it starts a session containing only items with a currently-recorded trouble score, sized to the number of such items (capped at `SESSION_LENGTH`), highest-scoring items kept when capping.
- The session behaves exactly like a normal session otherwise: single attempt per note, corrective feedback on a miss, missed items re-queued until answered correctly, trouble scores updated on every resolved attempt.
- Live stats and the end-of-session summary reflect the drill's own length, not a hardcoded 25; the summary is labeled distinctly from a normal session's.
- "Play again" after a drill starts another drill; "Play again" after a normal session starts another normal session.
- All v1–v6 definition-of-done items continue to hold.

## Corrective feedback improvements (v8 change)

Three small, independent additions to the miss path (Core loop / Corrective feedback above), none of which change matching, scoring, or selection:

- **Interval type named alongside the notes.** On a miss in interval mode, corrective feedback now reads e.g. "That was F4 + Gb4 (minor 2nd)" instead of just "That was F4 + Gb4". Pairs the visual gap on the staff with its verbal label (dual coding), which should help build a conceptual map of what each interval actually sounds/looks like rather than pure pattern memorization. The 12 semitone distances map to the standard names minor/major 2nd through 7th, tritone, and octave (`INTERVAL_NAMES`/`intervalNameFor` in `app.js`). This is purely a feedback-text addition — selection and trouble-score keys stay on the exact `(low, high)` pair as in v6, not the interval type, so interval type itself remains just as unpredictable to guess from ahead of time. A single-note miss has no interval to name and is unaffected.
- **Corrective feedback window doubled.** `INCORRECT_FEEDBACK_MS` goes from 1500ms to 3000ms — there's now more to read (note names plus, in interval mode, the interval name), so the miss needs more time on screen before the app auto-advances.
- **Virtual-piano interval-mode hint.** A one-line hint ("On the on-screen piano, tap the two notes one at a time — order doesn't matter, and you don't need to hold them down together.") appears below the practice-options bar whenever "Interval mode" is checked, hidden otherwise. This documents behavior that already worked without any code change (see `scripts/verify-virtual-piano-interval-input.mjs`): `onNoteOn`'s pending-notes matching has no timing requirement, so a mouse or a single finger — which can only ever be "down" on one key at a time — can already satisfy a two-note chord target by tapping the notes in sequence, in either order. The hint just makes that discoverable instead of leaving it to be figured out by trial and error.

## Definition of done for v8
- A miss on a two-note interval target names the interval type in parentheses after the note names; a miss on a single-note target does not.
- `INCORRECT_FEEDBACK_MS` is 3000ms (**superseded in v9** — now 10000ms, see below); corrective feedback and the input block it imposes remain active for the full window before auto-advancing.
- The interval-mode virtual-piano hint is hidden by default, appears when "Interval mode" is checked, and disappears when unchecked.
- All v1–v7 definition-of-done items continue to hold.

## Closable info boxes, longer feedback window (v9 change)

Two of v8's additions are now dismissible, and the corrective feedback window is longer:

- **`INCORRECT_FEEDBACK_MS` raised to 10000ms** (from 3000ms) — now that a miss can show note names plus an interval name, 3s wasn't enough to comfortably read it before the app auto-advanced. Ten seconds is a ceiling, not a forced wait (see next point).
- **Corrective feedback is closable.** The corrective-feedback box now has a close (`×`) button. Clicking it cancels the pending auto-advance timer and resolves immediately — same as if the timer had elapsed (hides the box, unblocks input, advances to the next note) — just on the user's own timing instead of waiting out the full 10s. The timeout handle is tracked (`correctiveFeedbackTimeout` in `app.js`) specifically so this early-dismiss path can cancel it.
- **The interval-mode virtual-piano hint (v8) is closable too**, with its own close button. Dismissing it hides it immediately and keeps it hidden even if "Interval mode" is subsequently unchecked and re-checked in the same page load — it only reappears after a full page reload. This isn't persisted to `localStorage`; it's a lightweight "I've got it" for the current session, not a permanent preference.
- **Bug fix alongside this:** starting a new session (`startSession()`) while a previous miss's corrective feedback was still showing used to leave that miss's auto-advance timer running. It would later fire against the *new* session's state and silently skip a note. `startSession()` now cancels any pending corrective-feedback timeout as part of resetting session state.

## Definition of done for v9
- `INCORRECT_FEEDBACK_MS` is 10000ms.
- Clicking the corrective-feedback box's close button hides it and advances to the next note immediately, without waiting for the rest of the window to elapse.
- Clicking the interval-mode piano hint's close button hides it immediately; it stays hidden across unchecking/rechecking "Interval mode" within the same page load.
- Starting a new session while a miss's corrective feedback is still showing does not later cause an extra, unrequested advance once the old window would have elapsed.
- All v1–v8 definition-of-done items continue to hold, except where explicitly superseded above.

## Corrective feedback pause button (v10 change)

Raised directly from real use on an iPad at the piano, where there's no mouse to hover-to-pause (the standard toast-notification pattern): even a 10s window (v9) is still a countdown competing with actually reading the feedback, and the only prior escape hatch (the close button) both stops it *and* advances — there was no way to just stop it from disappearing without also moving on.

The corrective-feedback box gets a second button, a pause (`⏸`) icon, next to the existing close (`×`):

- **Pause stops the countdown without closing the box or advancing.** It clears the same tracked timeout the close button uses (`correctiveFeedbackTimeout`), but that's the *only* thing it does — the box stays up, input stays blocked, indefinitely, until the close button is used. This is deliberately not a pause/resume toggle: once paused, the only way to move forward is the close button, since there's nothing meaningful left to "resume" (the countdown is simply gone for that miss).
- **The pause button hides itself once used** — nothing left for it to do until the next miss, so leaving it visible and clickable would be confusing/inert. `showCorrectiveFeedback()` un-hides it again for every fresh miss.
- **The close button had to change its guard.** It previously checked "is there a pending timeout" to decide whether there's anything to dismiss — but a paused miss has already cleared that timeout while still very much needing to be dismissible. It now guards on `session.awaitingAdvance` instead, which stays true for the whole miss regardless of whether the countdown is running or paused.
- Verified manually via `scripts/verify-corrective-feedback-pause.mjs` (`npm run verify:pause`), a committed diagnostic in the same style as `verify-virtual-piano-interval-input.mjs`.

## Definition of done for v10
- Clicking the pause button stops the auto-advance countdown; the corrective-feedback box and the input block it imposes remain in place indefinitely (tested past the full 10s window) until the close button is clicked.
- The pause button hides itself once clicked, and reappears for the next miss's feedback.
- The close button still hides the box and advances the session after a miss has been paused.
- All v1–v9 definition-of-done items continue to hold.

## "Randomize key" mode (v11 change)

A new checkbox, **"Randomize key"**, off by default. Unchecked, the app behaves exactly as before — implicitly C major/A minor, no key signature drawn, "Chromatic notes"/"Interval mode" govern out-of-key tones exactly as they already did. Checked, every new attempt (not once per session, unlike the other toggles — see rationale below) picks one of **15 standard key signatures** and spells/renders the target relative to it, with a label near the staff showing both names for that signature (e.g. "Eb major / C minor").

- **Scope: 15 keys, not 30.** A major key and its relative minor share the exact same key signature — the distinction between them is harmonic/functional (which chord a piece resolves to), and this app has no concept of chord progressions or cadences, so there's only one list of 15 (`KEY_NAMES` in `app.js`): C, G, D, A, E, B, F#, Gb, C#, Db, Ab, Eb, Bb, F, Cb — every major key signature that doesn't require a double sharp/flat. `RELATIVE_MINOR_NAME` supplies the second name shown in the UI label.
- **Per-attempt, not per-session.** Unlike "Chromatic notes"/"Interval mode" (captured once at `startSession()`), a new key is picked for every attempt, "like one measure in a real song" — a two-note interval-mode target shares one key across both notes. A re-queued miss keeps its original key rather than getting a fresh one (`requeue` now threads `key` through, same as `midis`).
- **Spelling algorithm** (`spellCandidatesInKey`/`spellInKey`/`spellNoteForKey`/`spellChordInKey` in `app.js`): for a pitch already diatonic to the key, no accidental *glyph* is drawn on the staff (the key signature at the clef already covers it) — even though the pitch itself may be altered. For a chromatic (out-of-key) pitch, an explicit accidental is always drawn: if canceling an existing key-signature alteration on some letter reaches the target exactly (a natural sign), that's used — it's the standard, expected notation choice, and at most one letter can ever qualify (two different letters never share a natural pitch), so there's no real ambiguity. Only when neither applies — a genuinely foreign pitch with no natural-sign shortcut — is there an actual tie between sharpening the lower diatonic neighbor letter or flattening the upper one; that tie is broken with a coin flip, the same pattern as the existing clef-ambiguity-zone randomization (`chooseClef`).
- **Chord collision avoidance generalizes the existing rule, including a fallback beyond just the coin-flip case.** The v5 rule (a minor-second chord landing on a natural + its own sharp gets respelled so they don't share a letter) was a single hardcoded case for the always-sharp, key-less system. `spellChordInKey` generalizes it, and had to go one step further than "just re-flip a tied coin": a note's *preferred* spelling (e.g. a natural-cancel, which is otherwise never in doubt) can also collide with another note's non-negotiable diatonic spelling — found in real use in Cb major, where Cb3 is diatonic and C-natural's preferred spelling is also letter "c". Since a diatonic note can't be respelled without becoming nonstandard notation, the *flexible* note has to fall back to its alternative candidate instead (here, D double-flat — an uglier but musically correct respelling of the same pitch), even outside the genuine-coin-flip case. `spellCandidatesInKey` now always returns every viable spelling ranked best-first (not just the winner) so this fallback is available when needed; whichever of the two notes has fewer options is assigned first (it has the least room to adapt), so the more flexible note is the one asked to avoid the collision, not the other way around.
- **Text (VexFlow key string and the corrective-feedback display name) is not the same thing as the staff glyph.** A natural-sign accidental doesn't appear in either — unlike `#`/`b`, a bare letter+octave (e.g. "e/4", "E4") is already unambiguously natural, so only the separate accidental *modifier* draws the visible natural-sign glyph on the staff. The reverse case matters just as much: a **diatonic** note (e.g. F# in D major) correctly gets no glyph on the staff, since the key signature already covers it — but the display *name* still has to spell out "F#5", not "F5", because plain text has no key-signature context to lean on the way the staff does. (Found in real use: a miss on a diatonic F#5 in D major showed "That was F5" — the display-name formatter was reusing the staff's glyph-omission logic for text too. Fixed by carrying the note's real semitone offset from its natural pitch through to the display-name formatter separately from the staff glyph, so the two can differ.)
- **Spelling is computed once per attempt, not recomputed on demand.** Since it can involve a genuine coin flip, `showNextNote` computes it once (`spellChordInKey`) and stores it on `session.current.spellings`; both `renderStaff` and `showCorrectiveFeedback` reuse that stored result rather than recomputing, so a miss's corrective-feedback text always names the exact spelling that was actually rendered on the staff.
- **Bug fix alongside the original v11 work:** starting a session while corrective feedback for a previous miss is still showing already had a fix for a dangling auto-advance timer (see v9); the same fix now also has to survive the new `key`/`spellings` fields flowing through `session.current` without reintroducing a stale-state bug — covered by the existing dangling-timer regression test continuing to pass alongside the new key-aware tests.

## Definition of done for v11
- With "Randomize key" off, behavior is unchanged from v10: no key label shown, no key signature drawn, spelling identical to the always-sharp key-less path.
- With it on, each attempt shows a key signature and a "X major / Y minor" label, and the target note(s) are spelled correctly relative to that key (diatonic notes unmarked, an explicit natural/sharp/flat drawn only when the pitch actually deviates from what the key signature implies).
- A pitch that's a natural-sign cancellation of an existing key alteration is spelled that way consistently (not left to chance); a pitch with no natural-sign option available is spelled either way roughly evenly across repeated trials.
- An interval-mode chord never renders two noteheads on the same letter+octave distinguished only by an accidental, for any of the 15 keys — including when the collision comes from a note's normally-preferred (non-coin-flip) spelling, such as a natural-cancel colliding with an unrelated diatonic note, not just from a genuine coin-flip tie.
- A re-queued miss keeps the same key it was first shown with.
- Corrective feedback on a miss names the exact spelling that was rendered on the staff, never a freshly re-rolled one.
- A diatonic note's display name (in corrective feedback) always spells out its real accidental (e.g. "F#5"), even though the staff correctly shows no glyph for it — the two are allowed to differ, since text has no key-signature context the way the staff does.
- All v1–v10 definition-of-done items continue to hold.

## App version display (v12 change)

A small `vN` line in the footer (`#app-version` in `index.html`), below the browser-support note. It's a plain hardcoded string, not computed from anything — this app deliberately has no build step (see README), so there's no automatic source for it (e.g. a Vercel build-time env var like `VERCEL_GIT_COMMIT_SHA` would need one). It has to be bumped by hand alongside this file's own Status version number; `CLAUDE.md`'s working conventions now call this out explicitly as part of the existing "update SPEC.md when shipping a change" step, so the two don't drift apart.

A commit SHA was considered and rejected for this specific purpose: it identifies an exact code snapshot precisely, but doesn't mean anything at a glance the way "v11" (tied to a feature milestone) does.

## Definition of done for v12
- The footer shows the app's current version as `vN`, matching the highest version number in this file's Status section.
- All v1–v11 definition-of-done items continue to hold.

## Correct-interval-name reinforcement, bigger touch targets (v13 change)

Two independent, small additions:

- **A correct interval-mode attempt briefly names the interval type** (e.g. "minor 2nd"), shown top-right on the staff panel. Never shows the note names themselves, and never appears for single notes — that would undercut the v3 "no note name shown on success" rationale (the retrieval-practice benefit depends on nothing revealing which specific notes were played; naming the interval *type* doesn't reveal that). Since correct single-note answers already advance immediately with nothing shown, showing interval-mode text needs a brief pause to actually be readable — `onNoteOn`'s correct-resolution path now delays `advance()` by `CORRECT_INTERVAL_NAME_MS` (900ms) specifically for a 2-note target, blocking input during that window the same way a miss already blocks input during its own feedback window (`session.awaitingAdvance`), so a stray note-on can't be misread against the already-resolved target. Starting a new session while this delay is pending cancels it, the same dangling-timer fix already applied to corrective feedback (v9).
- **The corrective-feedback pause and close buttons are bigger** — found in real use on an iPad, where the two sitting right next to each other made it easy to tap the wrong one. `.dismiss-btn` (shared by both, and by the interval-mode piano hint's close button) got a bigger font size and an explicit minimum touch-target size, and the corrective-feedback pill itself got slightly more padding and spacing between its children.

## Definition of done for v13
- A correct interval-mode attempt shows the interval type (not the note names) briefly, then advances; a correct single-note attempt shows nothing and advances immediately, unchanged from v3.
- Input during the interval-name pause is blocked, same as during a miss's corrective-feedback window; a note-on during that pause neither registers as a miss nor double-advances.
- Starting a new session while the interval-name pause is pending does not later cause an extra, unrequested advance once the old delay would have elapsed.
- The corrective-feedback pause/close buttons (and the interval-piano-hint close button, via the shared class) have a minimum ~32px touch target.
- All v1–v12 definition-of-done items continue to hold.

## Corrective-feedback alert repositioned (v14 change)

The corrective-feedback (miss) alert was centered at the top of the staff panel (`left: 50%` / `transform: translateX(-50%)`), which sat directly over the clef and the note(s) it names since the staff SVG is itself horizontally centered in the panel — the exact bug shown in BACKLOG.md #12's screenshot. It now uses the same `top: 1rem; right: 1rem;` corner positioning as the correct-interval-name box (v13), which never had this problem. The two alerts are mutually exclusive (one shows on a miss, the other on a correct interval-mode attempt), so sharing the same corner never causes them to overlap each other.

## Definition of done for v14
- The corrective-feedback alert renders in the top-right corner of the staff panel, not centered over it.
- The alert does not overlap the note glyph(s) rendered on the staff for a miss.
- All v1–v13 definition-of-done items continue to hold.

## Swedish octave names (v15 change)

Every note/interval shown on the staff is now also labeled with its Swedish octave name(s) (`SWEDISH_OCTAVE_NAMES`/`swedishOctaveName`/`swedishOctaveLabel` in `app.js`), e.g. "Ettstrukna oktaven" for middle C's octave. Shown in the bottom-left corner of the staff panel (`#octave-name`), deliberately quieter (lower opacity, no bold) than the top-left key-display label — this is incidental reference info, not something the drill is testing. Unlike the key-display label, it isn't conditional on "Randomize key" — it shows for every attempt.

For a two-note (interval-mode) target, both octave names are shown as `<lower> / <higher>`; if both notes land in the same Swedish octave, the name is shown once, not repeated. The octave used matches whatever spelling is actually notated on the staff — with "Randomize key" on, that's `session.current.spellings`' octave field (which can differ from a plain `midi`-based octave at an enharmonic edge, e.g. B# vs C, the same reasoning already applied to corrective feedback's note naming); otherwise it's the plain `Math.floor(midi / 12) - 1` computation.

This supersedes the original idea in BACKLOG.md #11 (showing Swedish names only inside the corrective-feedback error message) — showing it proactively, for every attempt, in a fixed discreet spot was judged a better fit than only surfacing it on a miss.

## Definition of done for v15
- Every attempt (single note or interval) shows its Swedish octave name(s) in the staff panel's bottom-left corner as soon as the note/interval is rendered — not only on a miss.
- A two-note target shows `<lower> / <higher>`; the same Swedish octave for both notes collapses to one name.
- With "Randomize key" on, the octave name matches the spelling actually notated on the staff, not a raw midi-based computation that could disagree with it at an enharmonic edge.
- All v1–v14 definition-of-done items continue to hold.