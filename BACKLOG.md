# PrimaVista — Backlog

Ideas for future features, not yet committed to or scheduled. Nothing here is decided — see `SPEC.md` for what's actually shipped and its "Out of scope" lists for related items already ruled out for now.

## Weighted note selection based on historical misses

Persist per-note accuracy across sessions and bias note selection toward notes the user has historically missed more often, instead of picking uniformly at random each session.

**Why:** the app already does a mini version of this within a single session (missed notes are re-queued to reappear before the session ends — see `SPEC.md` v3). Extending that across sessions is likely the highest-leverage next step for the app's actual goal (faster mastery of weak notes), more so than notation-realism additions like accidentals or key signatures.

**Open question (raised 2026-07-31):** the natural implementation is `localStorage`, but that's only stored in one browser on one device — not synced across devices, gone if the user clears browser data, and effectively invisible in a different browser or incognito. `SPEC.md`'s v1 non-goals explicitly rule out "persistence beyond the current browser session," so before starting this needs a decision: is browser-local persistence an acceptable middle ground, or does per-note history belong behind real accounts/a backend (a much bigger scope jump)? Undecided — needs more thought.
