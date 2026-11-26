# Session Log — 2026-07-23T00:00:00Z

**Topic:** Convert to Markdown — accented character (mojibake) corruption fix

**Requested by:** Eric Decarufel

## Summary

Link fixed a bug where accented characters (e.g. "É") in Convert to Markdown output were corrupted to U+FFFD replacement characters on Windows (reported on a French install). Root cause: the `markitdown` Python subprocess falls back to the OS locale codepage (cp1252) for piped stdout instead of UTF-8; Node then mis-decoded the resulting bytes as invalid UTF-8.

Fix: forced `PYTHONIOENCODING=utf-8` and `PYTHONUTF8=1` into the `spawn()` environment for both `_runMarkitdown` and `_probeInterpreter` in `markitdownConversionService.ts`. Added 2 tests asserting the env vars are set and that the rest of `process.env` is preserved.

**Verification:** `npm run check:types` ✓, `npm run compile` ✓, `npm test` → 378 passing (2 pre-existing, unrelated failures confirmed via `git stash` to predate this change).

**Files touched:** `src/features/convert-to-markdown/markitdownConversionService.ts`, `test/suite/markitdownConversionService.test.ts`.

**Decision recorded:** see `.squad/decisions.md` — "Convert to Markdown — fix accented character (mojibake) corruption on Windows".
