### 2026-07-21: Commit-message SCM context QA gate approved

**By:** Trinity (Tester / QA)
**What:** Approved the commit-message SCM context fix. The command passes `SourceControl.rootUri`; the service uses canonical URI comparison to choose the invoked Git repository before maintaining legacy fallback selection for no SCM context or unmatched context.
**Why:** Focused command and service tests cover context forwarding, selection of a non-index-zero repository, and unmatched-context fallback. No issue was found with selection, auto-staging, or input-box population.

**Validation note:** `git diff --check` passed for the reviewed files. Project-wide `npm run check:types` and test compilation are presently blocked by unrelated missing RTF-converter dependencies/types; the broad extension-host test runner did not apply its grep argument and terminated with SIGINT.
