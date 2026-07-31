# Working conventions

- Always add tests and tooling to the tracked source tree (e.g. `tests/`, `scripts/`), never to `/tmp`, a scratchpad, or any other location hidden from the human. Anything used to verify a fix must be committed so it can be re-run in a later session.
- When fixing a bug, write a regression test that fails on the pre-fix code and passes on the post-fix code before committing. Verify this by stashing the fix, running the test, and restoring the fix.
