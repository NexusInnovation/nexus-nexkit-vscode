### 2026-07-21: SCM context determines the multi-root commit-message target

**By:** Link
**What:** `generateCommitMessage` accepts the Git SCM action's optional root URI and selects the Git repository with the same canonical `Uri.toString(true)` value before applying the existing staged-change and first-repository fallbacks.
**Why:** Git title-menu actions must generate into the repository from which the action was invoked, while Command Palette and unmatched-context invocations retain their established behavior.
