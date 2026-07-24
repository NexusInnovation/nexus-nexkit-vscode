### 2026-07-24: Repository sync LOT 1 scaffold wiring approach

**By:** Eric De Carufel (via Link)
**What:** Implement repository sync as conservative scaffold-only architecture in this lot: typed models/services/commands, DI wiring through ServiceContainer, typed settings through SettingsManager, package command/settings contributions, status-bar and scheduler lifecycle hooks, and baseline unit tests; no destructive or real git pull behavior yet.
**Why:** Preserves extension stability while creating a production-shaped integration surface for later lots to add real git operations incrementally.
