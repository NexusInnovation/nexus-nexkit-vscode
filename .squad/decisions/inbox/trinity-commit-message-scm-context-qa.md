### 2026-07-21: Commit-message SCM context QA approval

**By:** Trinity (Tester / QA)
**What:** Approved the multi-root Git-menu commit-message routing change. An exact `SourceControl.rootUri` selects its matching Git repository; absent or unmatched SCM context preserves the pre-existing fallback behavior.
**Why:** Focused command and service tests cover routing and fallback selection, and the patch has no whitespace errors. Full TypeScript/test compilation is currently blocked by unrelated missing RTF converter dependencies.
