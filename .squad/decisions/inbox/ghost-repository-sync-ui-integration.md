### 2026-07-24: Repository Sync run-now contract + Tools tab integration

**By:** Ghost
**What:** Added a dedicated Repository Sync UI block in the Tools tab and introduced explicit webview message `repositorySyncRunOnce` routed by `NexkitPanelMessageHandler` to `Commands.REPOSITORY_SYNC_RUN_ONCE`.
**Why:** The Tools tab needed complete, explicit sync controls (including one-click run-now) while reusing existing host command paths and keeping UI behavior simple and non-intrusive.
