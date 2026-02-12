# GitHub Authentication Enhancement

## Problem

Private repositories (like "APM Templates" from NexusInnovation/nexus-agents-template) were getting 404 errors because:

1. Authentication status wasn't visible in logs (DEBUG level only)
2. No proactive detection of authentication availability
3. No user prompts to sign in when accessing private repos

## Solution

Enhanced the GitHub fetch logic to better handle private repositories:

### 1. **Proactive Authentication Check**

Authentication status is now checked **before** making any GitHub API requests:

```typescript
// Get auth info before making requests
const authInfo = await GitHubAuthHelper.getAuthInfo();
const headers = await this.getAuthHeaders();

this._logging.info(`[Templates] Fetching from GitHub repo '${this.config.name}'`, {
  owner,
  repo,
  branch,
  authSource: authInfo.source, // "environment", "vscode-session", or "none"
  isAuthenticated: authInfo.available, // true/false
});
```

### 2. **Visible Authentication Status**

Authentication information is now logged at **INFO level** (not DEBUG), so users can always see:

- Whether authentication is available
- Where it's coming from (environment variable, VS Code session, or none)
- This appears in the "Nexkit" Output channel

### 3. **Smart 404 Handling**

When a 404 is received, the code now distinguishes between two scenarios:

#### Scenario A: Private Repository (No Auth Available)

```typescript
if (response.status === 404 && !authInfo.available) {
  // Log as ERROR with clear action needed
  this._logging.error(`[Templates] Cannot access repository - authentication required`, {
    repository: this.config.name,
    authStatus: { source: "none", available: false },
    action: "Sign in to GitHub in VS Code to access private repositories",
  });

  // Show error message with "Sign In" button
  vscode.window
    .showErrorMessage(`Cannot access private repository '${this.config.name}'. Please sign in to GitHub in VS Code.`, "Sign In")
    .then((selection) => {
      if (selection === "Sign In") {
        vscode.commands.executeCommand("workbench.action.accounts.signIn");
      }
    });
}
```

#### Scenario B: Wrong Path/Branch (Auth Available)

```typescript
if (response.status === 404 && authInfo.available) {
  // Log as WARNING (path/config issue, not auth issue)
  this._logging.warn(`[Templates] GitHub path not found (404)`, {
    repository: this.config.name,
    path,
    branch,
    authStatus: { source: "vscode-session", available: true },
    hint: "Verify the branch and path are correct. The repository exists but this path may not.",
  });
}
```

### 4. **User Prompts**

When a private repository is detected (404 with no auth), users now get:

1. **Visual prompt**: Error message with "Sign In" button
2. **One-click action**: Clicking "Sign In" opens VS Code's account sign-in dialog
3. **Clear guidance**: Logs explain exactly what needs to be done

## Log Output Examples

### Before (Hidden Authentication)

```
2026-02-12 12:49:24.249 [warning] [Templates] GitHub path not found or no access (404)
2026-02-12 12:49:24.249 [info]   Data: {
  "repository": "APM Templates",
  "path": ".github/agents",
  "hint": "If this is a private repo, ensure you are signed in..."
}
```

### After (Visible Authentication)

#### Not Signed In

```
2026-02-12 13:15:10.123 [info] [Templates] Fetching from GitHub repo 'APM Templates'
2026-02-12 13:15:10.123 [info]   Data: {
  "owner": "NexusInnovation",
  "repo": "nexus-agents-template",
  "branch": "main",
  "authSource": "none",
  "isAuthenticated": false
}
2026-02-12 13:15:10.500 [error] [Templates] Cannot access repository - authentication required
2026-02-12 13:15:10.500 [info]   Data: {
  "repository": "APM Templates",
  "owner": "NexusInnovation",
  "repo": "nexus-agents-template",
  "path": ".github/agents",
  "branch": "main",
  "authStatus": {
    "source": "none",
    "available": false
  },
  "action": "Sign in to GitHub in VS Code to access private repositories"
}
```

**User sees error dialog**: "Cannot access private repository 'APM Templates'. Please sign in to GitHub in VS Code." [Sign In]

#### Signed In (Wrong Path)

```
2026-02-12 13:20:05.123 [info] [Templates] Fetching from GitHub repo 'APM Templates'
2026-02-12 13:20:05.123 [info]   Data: {
  "owner": "NexusInnovation",
  "repo": "nexus-agents-template",
  "branch": "main",
  "authSource": "vscode-session",
  "isAuthenticated": true
}
2026-02-12 13:20:05.500 [warning] [Templates] GitHub path not found (404)
2026-02-12 13:20:05.500 [info]   Data: {
  "repository": "APM Templates",
  "path": ".github/agents",
  "branch": "main",
  "authStatus": {
    "source": "vscode-session",
    "available": true
  },
  "hint": "Verify the branch and path are correct. The repository exists but this path may not."
}
```

## How to Sign In to GitHub

### Method 1: Using the Error Dialog

1. When the error appears, click **"Sign In"**
2. Follow VS Code's GitHub authentication flow

### Method 2: Manual Sign In

1. Click the profile icon (bottom left of VS Code)
2. Select **"Sign in with GitHub"**
3. Follow the authentication flow
4. Restart Nexkit extension or refresh templates

### Method 3: Command Palette

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Run: **Accounts: Sign In to GitHub**
3. Follow the authentication flow

## Testing

To test the enhancement:

1. **Configure a private repository** in Nexkit settings
2. **Sign out of GitHub** in VS Code (if signed in)
3. **Trigger template fetch** (switch modes, refresh, or initialize workspace)
4. **Observe**:
   - Log shows `authSource: "none", isAuthenticated: false`
   - Error dialog appears with "Sign In" button
   - Clicking "Sign In" opens account dialog
5. **Sign in to GitHub**
6. **Refresh templates**
7. **Observe**:
   - Log shows `authSource: "vscode-session", isAuthenticated: true`
   - Templates fetch successfully (or shows path/branch errors if config is wrong)

## Changes Summary

**File Modified**: `src/features/ai-template-files/providers/repositoryTemplateProvider.ts`

### Key Changes

1. **Added proactive auth check** in `fetchAllTemplates()`:
   - Calls `GitHubAuthHelper.getAuthInfo()` before any API requests
   - Logs authentication status at INFO level

2. **Enhanced 404 error handling**:
   - Distinguishes between "no auth" vs "wrong path" scenarios
   - Shows user prompts for private repo access
   - Provides different log levels and hints based on scenario

3. **Simplified `getAuthHeaders()` method**:
   - Removed redundant DEBUG logging
   - Auth status now logged once per fetch, not per request

### No Breaking Changes

- ✅ Fully backward compatible
- ✅ Works with existing configurations
- ✅ Gracefully handles both public and private repos
- ✅ No new settings required

## Benefits

1. **Immediate Feedback**: Users see authentication status in logs right away
2. **Clear Actions**: Error messages tell users exactly what to do
3. **One-Click Fix**: "Sign In" button in error dialog reduces friction
4. **Better Diagnostics**: Distinguishes between auth issues vs config issues
5. **Improved UX**: No more cryptic 404s for private repos

## Related Documentation

- [TEMPLATE_DEBUGGING.md](./TEMPLATE_DEBUGGING.md) - General template debugging guide
- [LOGGING_ENHANCEMENTS.md](./LOGGING_ENHANCEMENTS.md) - Complete logging implementation details
- [GitHub OAuth Setup](../scripts/GITHUB-OAUTH-APP-SETUP.md) - Enterprise GitHub setup
