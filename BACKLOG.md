# PrimaVista — Backlog

Ideas for future features, not yet committed to or scheduled. Nothing here is decided — see `SPEC.md` for what's actually shipped and its "Out of scope" lists for related items already ruled out for now.

Items are numbered (`## N: Title`) purely so they can be referenced quickly ("implement 1 and 2"). Numbers come from **Next number** below and are never reused, even after an item ships and is removed — same as GitHub issue/PR numbers, so a number always points to the same idea and gaps in the sequence (after something ships) are expected, not a mistake. Bump **Next number** by one every time an item is added.

**Next number:** 9

## 2: Mixing interval/chromatic modes with plain single notes

Currently "Chromatic notes" and "Interval mode" each apply to the *whole* session (captured once at `startSession()`); there's no way to get a session that mixes plain single notes with occasional chords/chromatic notes. Deferred out of v5 specifically to avoid designing a mixing ratio in the first slice — worth revisiting once the individual modes have been used enough to know whether mixing is actually wanted.

## 4: Interval mode: allow intervals bigger than an octave

Interval mode currently caps at 12 semitones (`MAX_INTERVAL_SEMITONES` in `app.js`), i.e. an octave. Raise the cap to include intervals up to a major 10th (16 semitones = octave + major 3rd) — roughly the widest reach playable with one hand, and still useful/realistic to practice reading and judging on the staff, unlike arbitrarily large spans.

## 5: Two hands?
Should then maybe be a rule that left hand is below middle c and right hand above?
TODO: refine

## 6: Keys? Not only C-major
Show the name of the key
TODO: refine

## 7: Show the notes and the name of the interval, even after correct playing
TODO: refine

## 8: Make the pause and close buttons a little bigger
Makes it easier to not click the wrong one on iPad, probably make the entire red button a bit gigger. 