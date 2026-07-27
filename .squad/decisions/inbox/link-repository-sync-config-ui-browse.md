### 2026-07-25: Repository sync panel configuration browse and selection flow

**By:** Link
**What:** Added a dedicated extension->webview repository sync configuration snapshot (`repositorySyncConfigurationUpdate`) and webview->extension commands for get/browse-add/remove of watched repositories and scan roots. Host now owns browse dialogs, path normalization (`path.resolve` + `path.normalize`), settings persistence, and feedback messaging after each action.
**Why:** Keeps state updates centralized and reliable across host and webview, enables easy repository/scan-root management from the panel, and ensures users can see workspace repositories plus current watched selection in one configuration view.
