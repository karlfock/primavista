# PrimaVista — Backlog

Ideas for future features, not yet committed to or scheduled. Nothing here is decided — see `SPEC.md` for what's actually shipped and its "Out of scope" lists for related items already ruled out for now.

Items are numbered (`## N: Title`) purely so they can be referenced quickly ("implement 1 and 2"). Numbers come from **Next number** below and are never reused, even after an item ships and is removed — same as GitHub issue/PR numbers, so a number always points to the same idea and gaps in the sequence (after something ships) are expected, not a mistake. Bump **Next number** by one every time an item is added.

**Next number:** 14

## 4: Interval mode: allow intervals bigger than an octave

Interval mode currently caps at 12 semitones (`MAX_INTERVAL_SEMITONES` in `app.js`), i.e. an octave. Raise the cap to include intervals up to a major 10th (16 semitones = octave + major 3rd) — roughly the widest reach playable with one hand, and still useful/realistic to practice reading and judging on the staff, unlike arbitrarily large spans.

## 5: Two hands?
Should then maybe be a rule that left hand is below middle c and right hand above? Overlapping ranges between the two hands would be fine (realistic — both hands can play the same register).

Refined scope (after discussion): the naive version of this — two full intervals at once, one per hand — isn't really "doubling" interval mode, it stacks two independent complexity axes (hand-separation *and* per-hand interval judgment) at once, and strains things that don't scale cleanly to 4 notes: trouble-score weighting keys on the exact midi pair, so a 4-note combo either explodes the key space into near-uniqueness or needs two independent per-hand scores; and the "single attempt, re-queue on miss" rule (SPEC.md v3) gets ambiguous when one hand is right and the other wrong. Start smaller instead: two independent **single notes** per hand (not full intervals) — already delivers the real training value (reading bass + treble simultaneously) without also solving interval judgment × hand independence in one shot. Full two-intervals-per-hand can be a later step once single-note-per-hand is proven out.