### 2026-07-24: Repository Sync panel host feedback contract (Lot 5)

**By:** Link
**What:** Added a dedicated extension->webview message contract `repositorySyncActionFeedback` with payload `{ message, level, timestamp, actionType }` and routed all repository sync panel command acknowledgements through it (success and safe error fallback). Extended `AppState` with `repositorySync.lastFeedback` + bounded `history` (max 10) and made the UI prefer host feedback over local optimistic status.
**Why:** Repository sync actions are host-executed commands; explicit host acks create a reliable user feedback loop and avoid ambiguous UI status when command execution timing/errors differ from local button-click state.
