### 2026-07-25: Repository Sync hidden repositories (hide/show from panel)
**By:** Link
**What:** Added `nexkit.repoSync.hiddenRepositories` setting, host commands `repositorySyncHideRepository`/`repositorySyncUnhideRepository`, and panel configuration snapshots including `hiddenRepositories`. Workspace repository display excludes hidden paths, and the UI now has a dedicated Hidden repositories section with Show actions while keeping existing watched/scan-root removal flows unchanged.
**Why:** Operators need a non-destructive way to remove repositories from visible sync scope without deleting workspace folders or watched/scan-root configuration.
