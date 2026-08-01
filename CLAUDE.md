# Working conventions

- Use the scripts defined in `package.json` (e.g. `npm test`, `npm run test:ui`, `npm start`, `npm run screenshot`) rather than invoking the underlying tools directly (e.g. `npx playwright test`). If a command you need isn't in `package.json` yet, add it there first.
- Always add tests and tooling to the tracked source tree (e.g. `tests/`, `scripts/`), never to `/tmp`, a scratchpad, or any other location hidden from the human. Anything used to verify a fix must be committed so it can be re-run in a later session.
- When fixing a bug, write a regression test that fails on the pre-fix code and passes on the post-fix code before committing. Verify this by stashing the fix, running the test, and restoring the fix.
- After implementing a feature or behavior change (not a pure bug fix), update `SPEC.md` in the same session: bump/add a version entry under Status, add or update a section describing the change, and correct any now-outdated non-goals / "out of scope" / definition-of-done items it touches. Don't let the spec drift out of sync with what's actually shipped.
