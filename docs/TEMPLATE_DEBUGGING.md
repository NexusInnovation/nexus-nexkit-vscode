# Template Debugging Guide

This document explains the diagnostic logging added to help troubleshoot issues with AI template loading, particularly when the "Agent Templates" section appears empty in APM mode.

## Quick Start

1. Open the **Nexkit** Output channel:
   - View → Output (or Ctrl+Shift+U / Cmd+Shift+U)
   - Select "Nexkit" from the dropdown

2. Trigger template loading:
   - Switch modes (Dev/APM)
   - Refresh templates
   - Initialize a workspace

3. Review the diagnostic logs (see sections below)

## What Gets Logged

### 1. Repository Configuration (Initialization)

**Log Tag**: `[Templates] RepositoryManager initialized`

Shows all enabled repositories and their configurations:

```json
{
  "enabledRepositoryCount": 2,
  "repositories": [
    {
      "name": "Nexus",
      "type": "github",
      "url": "https://github.com/example/templates",
      "branch": "main",
      "enabled": true,
      "modes": ["Developers", "APM"],
      "paths": {
        "agents": ".github/agents",
        "prompts": ".github/prompts",
        "instructions": ".github/instructions",
        "chatmodes": ".github/chatmodes"
      }
    }
  ]
}
```

**What to check:**

- Are the expected repositories listed?
- Are the paths correct?
- Does the repository include the mode you're using (Developers/APM)?
- Is the branch correct?

---

### 2. GitHub API Requests

**Log Tag**: `[Templates] GitHub API request starting` / `response received`

Logs every GitHub API call with detailed diagnostics:

#### Request Information

```json
{
  "repository": "Nexus",
  "type": "agents",
  "path": ".github/agents",
  "branch": "main",
  "apiUrl": "https://api.github.com/repos/..."
}
```

#### Response Information

```json
{
  "status": 200,
  "statusText": "OK",
  "durationMs": 245,
  "rateLimit": {
    "remaining": "4998",
    "limit": "5000",
    "used": "2",
    "resource": "core",
    "resetAt": "2024-01-15T10:30:00.000Z"
  },
  "contentType": "application/json",
  "contentLength": "1234",
  "etag": "W/\"abc123\""
}
```

#### Authentication Status

```json
{
  "repository": "Nexus",
  "isAuthenticated": true,
  "userAgent": "Nexkit-VSCode-Extension",
  "hint": "Authenticated requests have rate limit of 5000/hour"
}
```

**What to check:**

- **Status Code**:
  - `200 OK`: Success
  - `404 Not Found`: Path or branch doesn't exist, or no access to private repo
  - `401 Unauthorized`: Not authenticated for private repo
  - `403 Forbidden`: Rate limit exceeded or missing permissions
- **Authentication**:
  - `isAuthenticated: false`: Using unauthenticated requests (60/hour limit)
  - `isAuthenticated: true`: Signed into GitHub (5000/hour limit)
- **Rate Limits**:
  - `remaining: "0"` + 403 status = Rate limit exceeded
  - Check `resetAt` timestamp to see when limit resets
- **Timing**:
  - High `durationMs` (>5000ms) may indicate network issues

---

### 3. Template Fetch Results

**Log Tag**: `[Templates] Fetched X template(s) from 'RepoName'`

Shows per-repository, per-type fetch results:

```json
{
  "repository": "Nexus",
  "type": "agents",
  "path": ".github/agents",
  "branch": "main"
}
```

Followed by count: `Fetched 5 agents template(s) from 'Nexus'`

**What to check:**

- Are templates being found (count > 0)?
- Are all expected types being fetched?
- Missing counts indicate empty directories or path mismatches

---

### 4. Repository Fetch Summary

**Log Tag**: `[Templates] Completed GitHub fetch for 'RepoName'`

```json
{
  "repository": "Nexus",
  "templateCount": 15
}
```

**What to check:**

- `templateCount: 0` means no templates found (check paths/branch)
- Low counts may indicate missing directories

---

### 5. Aggregate Initialization Results

**Log Tag**: `[Templates] Initialization fetch results`

Shows overall statistics across all repositories:

```json
{
  "templateCount": 25,
  "successCount": 2,
  "failureCount": 0,
  "countsByType": {
    "agents": 5,
    "prompts": 10,
    "skills": 3,
    "instructions": 5,
    "chatmodes": 2
  },
  "repositories": [
    {
      "repositoryName": "Nexus",
      "success": true,
      "templateCount": 15,
      "modes": ["Developers", "APM"]
    }
  ]
}
```

**What to check:**

- `templateCount: 0` with `failureCount: 0` = repositories are fetching but directories are empty
- `failureCount > 0` = some repositories failed (check error logs above)
- `countsByType.agents: 0` in APM mode = no agents available

---

### 6. APM Empty Agent Detection

**Log Tag**: `[APM] Agent Templates is empty`

**Only fires when:**

1. Mode is APM
2. At least one repository is configured for APM (`modes` includes `APM`)
3. Zero agent templates were loaded from APM repositories

```json
{
  "modeSetting": "APM",
  "apmRepositoryCount": 1,
  "apmAgentCount": 0,
  "apmRepositories": [
    {
      "name": "Nexus-APM",
      "modes": ["APM"],
      "agentCount": 0,
      "countsByType": {
        "agents": 0,
        "prompts": 5,
        "skills": 2,
        "instructions": 3,
        "chatmodes": 1
      }
    }
  ],
  "hint": "Check earlier [Templates] logs for GitHub auth/rate-limit, 404 path, or branch/path mismatches..."
}
```

**What to check:**

- This is the smoking gun for empty APM Agent Templates
- Look at `apmRepositories` to see which repos were checked
- If `agentCount: 0` but other counts > 0, the agents path is probably wrong
- Scroll up in logs to find the GitHub fetch attempt for this repository's agents path

---

### 7. File Download Operations

**Log Tag**: `[Templates] Downloading template file from GitHub`

For individual template installations:

```json
{
  "repository": "Nexus",
  "name": "copilot-agent.md",
  "type": "agents",
  "status": 200,
  "durationMs": 120,
  "rateLimit": {
    "remaining": "4997",
    "limit": "5000"
  },
  "contentLength": "2048",
  "contentSize": 2048
}
```

---

### 8. Directory Downloads (Skills)

**Log Tag**: `[Templates] Directory contents downloaded successfully`

When installing multi-file templates (skills):

```json
{
  "repository": "Nexus",
  "name": "typescript-expert",
  "filesDownloaded": 12,
  "directoriesProcessed": 3
}
```

---

## Common Issues & Solutions

### Issue: "Agent Templates is empty in APM mode"

**Diagnostic workflow:**

1. **Check repository configuration:**

   ```
   Look for: [Templates] RepositoryManager initialized
   Verify: Repository has modes: ["APM"]
   ```

2. **Check GitHub API calls:**

   ```
   Look for: [Templates] Fetching from GitHub repo 'YourRepo'
   Check: Does it fetch from the agents path?
   ```

3. **Check fetch results:**

   ```
   Look for: [Templates] Fetched X agents template(s)
   Problem: If X = 0, the path is empty or wrong
   ```

4. **Check for errors:**
   ```
   Look for: Status 404, 403, 401
   404: Wrong path/branch or private repo without access
   403: Rate limit or missing permissions
   401: Not authenticated
   ```

---

### Issue: "404 Not Found"

**Possible causes:**

1. **Wrong branch** → Check `"branch"` in repository config
2. **Wrong path** → Check `"paths"` in repository config
3. **Private repository without authentication** → Sign into GitHub in VS Code
4. **Repository moved/deleted** → Update repository URL

**How to fix:**

- Open Settings → Extensions → Nexkit → Repositories
- Verify branch name (usually `main` or `master`)
- Verify paths (e.g., `.github/agents` not `github/agents`)
- For private repos: Sign into GitHub via VS Code accounts

---

### Issue: "403 Forbidden (Rate Limit)"

**Symptoms:**

```json
{
  "status": 403,
  "rateLimit": {
    "remaining": "0",
    "resetAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Cause:** GitHub API rate limit exceeded

**Limits:**

- **Unauthenticated**: 60 requests/hour
- **Authenticated**: 5,000 requests/hour

**Solution:**

1. Sign into GitHub in VS Code (increases limit to 5000/hour)
2. Wait until `resetAt` timestamp
3. Reduce number of configured repositories/paths

---

### Issue: "401 Unauthorized"

**Cause:** Accessing private repository without authentication

**Solution:**

1. Sign into GitHub in VS Code
2. Ensure the account has access to the private repository
3. Run command: `Nexkit: Reload Extension` after signing in

---

### Issue: "Templates loading but count is 0"

**Symptoms:**

```json
{
  "success": true,
  "templateCount": 0
}
```

**Cause:** Paths exist but are empty, or contain wrong file types

**Solution:**

1. Verify the repository actually has `.md` files in the specified paths
2. For skills: Verify there are directories (not files) in the skills path
3. Check if files have `.md` extension (case-sensitive on Linux)

---

## GitHub Authentication

### How to Sign In

1. Open VS Code
2. Click the profile icon (bottom left)
3. Select "Sign in to sync settings"
4. Choose "Sign in with GitHub"
5. Follow the authentication flow

### Checking Authentication Status

Look for logs like:

```json
{
  "isAuthenticated": true,
  "hint": "Authenticated requests have rate limit of 5000/hour"
}
```

If `isAuthenticated: false`, you're not signed in.

---

## Best Practices

### 1. Always Check Logs First

When templates aren't loading, open the Nexkit output channel **before** reporting issues.

### 2. Look for Patterns

- Multiple 404s → Likely wrong branch/path configuration
- Multiple 403s → Rate limiting (sign into GitHub)
- 401s → Private repo without authentication

### 3. Mode Filtering

Remember: APM mode only shows templates from repositories with `modes: ["APM"]` or `modes: ["Developers", "APM"]`.

If a repository doesn't have `modes` or only has `modes: ["Developers"]`, it won't appear in APM mode.

### 4. Rate Limit Management

- Sign into GitHub for higher limits
- Avoid refreshing templates repeatedly in quick succession
- Check `resetAt` timestamp if rate limited

---

## Log Levels

Nexkit uses these log levels:

- **DEBUG**: Detailed per-request information (API calls, timings)
- **INFO**: Normal operations (fetch results, summaries)
- **WARN**: Potential issues (404s, empty results, APM diagnostics)
- **ERROR**: Failures (network errors, auth failures, rate limits)

---

## Collecting Logs for Bug Reports

When reporting issues:

1. Reproduce the issue
2. Open Nexkit output channel
3. Copy the relevant log section:
   - Repository initialization
   - GitHub API calls for the affected repository
   - Fetch results
   - Any warnings or errors
4. Include in your bug report with:
   - VS Code version
   - Nexkit version
   - Operating system
   - Whether you're signed into GitHub

---

## Related Documentation

- [Repository Configuration](../README.md#repository-configuration)
- [APM Mode Documentation](../README.md#apm-mode)
- [GitHub Authentication Setup](../scripts/GITHUB-OAUTH-APP-SETUP.md)
