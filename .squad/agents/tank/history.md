# Project Context

- **Owner:** Eric De Carufel
- **Current project:** Nexkit — VS Code extension managing AI templates (agents, prompts, instructions, chatmodes) from
  GitHub repos, plus workspace init, MCP server config, and extension self-updates. TypeScript strict, esbuild, Preact
  webview, Mocha + Sinon, semantic-release.
- **Prior project (archived):** EquipeLaurence — Azure Function pipeline, Nethris payroll → SharePoint. C# .NET 10.0,
  SpecFlow/Gherkin BDD, multi-environment CI/CD.
- **Created:** 2026-04-24

## Carried-forward rules (from archived learnings)

Full detail in `history-archive.md`. The rules that still bind:

- **Verify every claim in an inherited defect list against the source before acting on it.** Audit lists contain false
  positives, and the worst defects are usually the ones nobody reported.
- **Triage from the current worktree, not from stale build output.** Check `git diff` and re-run after a clean before
  changing implementation code for a compiler mismatch.
- **CI trigger separation:** PR triggers validate the proposed change; push triggers validate the merged result.
  Overlapping triggers across workflows cause duplicate builds; `needs` orders jobs _within_ a workflow only — there is no
  cross-workflow dependency enforcement, so cross-workflow races must be removed by consolidating the trigger.
- **PowerShell's `*` wildcard excludes dotfiles on Linux.** Use `Get-ChildItem -Force` when archiving build output.
- **Prefer environment variables over hardcoded resource names** when the name is generated (e.g. by `uniqueString`).
- **Default risky feature flags to off** so implementation work cannot affect live environments.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-07-30 — AFEAS Prerequisite Scripts: Cross-Platform Parity Repair (nexus-nexkit-vscode)

**Completed:** Repaired the six reference prerequisite scripts under `Documentation/prerequis/gl-afeas/`, created the
missing bash twin, pinned line endings, and extended the CI `test` job.

- **Inherited defect lists must be re-verified.** Of the six reported bugs, one (`local local_exit_code=0` allegedly at
  top-level scope in `validate-prerequisites.sh`) was a **false positive** — grep showed the identifier is simply a
  variable _named_ `local_exit_code`, which is valid bash. Two _unreported_ defects were more severe than anything on
  the list. Rule: verify every claim against the source before acting on a defect list.
- **Defect A (unreported, most severe):** `Check-Validation.ps1` computed its settings path with a double
  `Split-Path -Parent $PSScriptRoot`, landing one directory **above** the project root. check→validate→check therefore
  never converged **on Windows either** — not just on Unix as the audit implied.
- **Defect B (unreported):** the bash `compare_versions` normalizer used `sed 's/[^0-9.].*//'`, which yields an empty
  string for `v22.1.0` (node) and `git version 2.43.0`. **Node and Git were reported OUTDATED on every Unix run.**
- **State-path divergence was three-way, not two-way.** Canonical path is now
  `<project-root>/.vscode/afeas.local.settings.json` in all six scripts. Never `.vscode/settings.json` — that is the real
  VS Code schema file and is usually committed.
- **Version contract implemented identically in both languages:** normalize = first match of `[0-9]+(\.[0-9]+)*`
  (bash `grep -oE ... | head -n1`; PS `[regex]::Match($Raw, '\d+(\.\d+)*')`), then component-wise integer compare with
  missing components padded to `0`. **`sort -V` removed** — absent in busybox and semantically opaque. Verified 8/8
  identical PASS/FAIL across bash and pwsh.
- **`function Invoke-Command` in `Setup-Environment.ps1` shadowed the built-in cmdlet** — renamed to `Invoke-Step`,
  all 3 call sites updated. PowerShell resolves functions before cmdlets, so this silently hijacked every call.
- **`set -e` + "continue on error" is a contradiction in bash.** `invoke_command ... "true"` still aborted the script
  because the non-zero return propagated. Fixed with an explicit `|| true` plus a comment explaining why it is required.
- **Marker contract survives jq being absent.** `check-validation.sh` still emits `::VALIDATED::false` and exits 1 when
  jq is missing, so the extension's parser never sees a malformed stream; `validate-prerequisites.sh` is what surfaces
  the jq remediation message loudly.
- **CI: the 3-OS matrix already existed.** `ci-cd.yml`'s `test` job already ran `ubuntu-latest`, `windows-latest`,
  `macos-latest` with `xvfb-run -a` on Linux. Nothing was duplicated — only additive changes: job-level
  `NEXKIT_RUN_SCRIPT_TESTS: "1"`, `jq` appended to the Linux apt list, a guarded `brew install jq` for macOS, and a
  toolchain reporting step so a missing interpreter is diagnosable instead of mysterious.
- **`.gitattributes` was empty.** Added `*.sh text eol=lf` (a CRLF `.sh` dies with `bad interpreter: ...^M`) and
  `Documentation/prerequis/gl-afeas/*.ps1 text eol=crlf` — scoped deliberately to the reference folder so the rest of
  the repo does not churn, while still giving the tests a deterministic CRLF fixture source.
- **Executable bit is a git index property, not a file property, on Windows.** `git update-index --chmod=+x` was
  required; the three `.sh` files are now `100755`.
- **Residual security risk (reported, deliberately not restructured):** both `validate-prerequisites.sh` (`eval`) and
  `Validate-Prerequisites.ps1` (`Invoke-Expression`) execute version/install command strings taken from
  `requirements.json`. Marked with `NOTE SECURITE` comments. Restructuring is a separate change.
- **Decision recorded:** `.squad/decisions/inbox/tank-prereq-script-parity.md`

### 2026-07-30 — Team update (recorded by Scribe)

The prerequisite automation feature shipped through four rounds. Tank's script contract became the authoritative reference
that both Link's implementation and Trinity's parity tests conform to. Downstream consequences worth remembering:

- Ghost's Round 4 revision made the extension's marker parser **case-sensitive, separator-optional, first-match** to match
  Tank's contract exactly — the contract won, no divergence override was needed.
- Morpheus accepted the `eval` / `Invoke-Expression` surface as a **recorded residual risk**, confirming that no
  extension-side control closes it; only Workspace Trust does. The `NOTE SECURITE` comments are the standing marker.
- `--skip-validation` marks state validated without validating. The extension must never expose that flag.

See `history-archive.md` for learnings from 2026-04-24 through 2026-05-19 (EquipeLaurence era).
