# PrimaVista — Backlog

Ideas for future features, not yet committed to or scheduled. Nothing here is decided — see `SPEC.md` for what's actually shipped and its "Out of scope" lists for related items already ruled out for now.

## Interval practice: melodic mode

Alongside interval mode's current chord (harmonic, both notes together) presentation, add a melodic mode — the two notes played one after another rather than simultaneously, with the order (ascending/descending) randomized per note. Randomly choosing between chord and melodic presentation per note was also discussed, so both get practiced.

**Why deferred out of v5:** melodic notation needs two separate notes in sequence within one measure, which means picking a duration for each (e.g. two half notes instead of one whole note) — a small, real crack in `SPEC.md`'s "no rhythm" non-goal, even with a fixed non-varying duration. Detection also needs a different rule than chord mode: a specific two-note *sequence* (order matters, first wrong note-on should fail immediately rather than waiting for a note that'll never come) instead of an unordered pending set. Both are real enough to be their own follow-up rather than bundled into the first interval-mode slice.

**Decided (2026-07-31):** looked at how Piano Marvel's "Practice Mode" handles this for inspiration — it's tempo-free (matches what we want) but uses a wait-indefinitely-for-the-correct-note model with multiple attempts, not single-attempt. Explicitly rejected: "I can just sit and try all the notes, that is not a good way of learning." Melodic mode should stay single-attempt, consistent with the rest of the app (chord mode, single-note mode) — first wrong note-on in the sequence fails immediately, same as already planned above. Piano Marvel's model is fine for "hear what a piece sounds like" playback, not for a retrieval-practice drill like this one.

## Mixing interval/chromatic modes with plain single notes

Currently "Chromatic notes" and "Interval mode" each apply to the *whole* session (captured once at `startSession()`); there's no way to get a session that mixes plain single notes with occasional chords/chromatic notes. Deferred out of v5 specifically to avoid designing a mixing ratio in the first slice — worth revisiting once the individual modes have been used enough to know whether mixing is actually wanted.

## Name the interval type in corrective feedback

On a miss, corrective feedback currently shows only the note names (e.g. "That was F4 + Gb4") — not the interval type (e.g. "minor 2nd"). Naming it alongside the notes pairs the visual gap with its verbal label (dual coding), which should help build a conceptual map of what each interval actually is, rather than pure visual pattern memorization. Cheap: it's an addition to existing feedback text, not a new mechanic.
