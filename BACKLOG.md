# PrimaVista — Backlog

Ideas for future features, not yet committed to or scheduled. Nothing here is decided — see `SPEC.md` for what's actually shipped and its "Out of scope" lists for related items already ruled out for now.

## Weighted note selection based on historical misses

Persist per-note accuracy across sessions and bias note selection toward notes the user has historically missed more often, instead of picking uniformly at random each session.

**Why:** the app already does a mini version of this within a single session (missed notes are re-queued to reappear before the session ends — see `SPEC.md` v3). Extending that across sessions is likely the highest-leverage next step for the app's actual goal (faster mastery of weak notes), more so than notation-realism additions like accidentals or key signatures.

**Open question (raised 2026-07-31):** the natural implementation is `localStorage`, but that's only stored in one browser on one device — not synced across devices, gone if the user clears browser data, and effectively invisible in a different browser or incognito. `SPEC.md`'s v1 non-goals explicitly rule out "persistence beyond the current browser session," so before starting this needs a decision: is browser-local persistence an acceptable middle ground, or does per-note history belong behind real accounts/a backend (a much bigger scope jump)? Undecided — needs more thought.

**Update (2026-07-31):** decided to keep this simple for now (mostly used with a real piano connected to an iPad, so cross-device sync isn't a pressing need) — parked here, not being built yet.

## Interval practice: melodic mode

Alongside interval mode's current chord (harmonic, both notes together) presentation, add a melodic mode — the two notes played one after another rather than simultaneously, with the order (ascending/descending) randomized per note. Randomly choosing between chord and melodic presentation per note was also discussed, so both get practiced.

**Why deferred out of v5:** melodic notation needs two separate notes in sequence within one measure, which means picking a duration for each (e.g. two half notes instead of one whole note) — a small, real crack in `SPEC.md`'s "no rhythm" non-goal, even with a fixed non-varying duration. Detection also needs a different rule than chord mode: a specific two-note *sequence* (order matters, first wrong note-on should fail immediately rather than waiting for a note that'll never come) instead of an unordered pending set. Both are real enough to be their own follow-up rather than bundled into the first interval-mode slice.

**Decided (2026-07-31):** looked at how Piano Marvel's "Practice Mode" handles this for inspiration — it's tempo-free (matches what we want) but uses a wait-indefinitely-for-the-correct-note model with multiple attempts, not single-attempt. Explicitly rejected: "I can just sit and try all the notes, that is not a good way of learning." Melodic mode should stay single-attempt, consistent with the rest of the app (chord mode, single-note mode) — first wrong note-on in the sequence fails immediately, same as already planned above. Piano Marvel's model is fine for "hear what a piece sounds like" playback, not for a retrieval-practice drill like this one.

## Mixing interval/chromatic modes with plain single notes

Currently "Chromatic notes" and "Interval mode" each apply to the *whole* session (captured once at `startSession()`); there's no way to get a session that mixes plain single notes with occasional chords/chromatic notes. Deferred out of v5 specifically to avoid designing a mixing ratio in the first slice — worth revisiting once the individual modes have been used enough to know whether mixing is actually wanted.
