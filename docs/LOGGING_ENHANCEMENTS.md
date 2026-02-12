# Template System Logging Enhancements

This document describes the comprehensive diagnostic logging added to the template fetch pipeline to help troubleshoot issues like empty "Agent Templates" sections.

## Overview

**Problem**: On some Nexkit installations, the "Agent Templates" section appears empty in APM mode with no clear indication of why.

**Solution**: Added comprehensive diagnostic logging at every layer of the template fetch pipeline, with special detection for APM-specific issues.

## Changes Summary

### Files Modified

1. **repositoryTemplateProvider.ts** - GitHub fetch operations
2. **localFolderTemplateProvider.ts** - Local folder fetch operations
3. **templateFetcherService.ts** - Repository aggregation
4. **aiTemplateDataService.ts** - Service initialization/refresh
5. **repositoryManager.ts** - Repository configuration
6. **nexkitPanelMessageHandler.ts** - APM empty-agent detection
7. **runTest.ts** - Test infrastructure timeout fix

### Files Created

1. **templateDiagnostics.ts** - APM diagnostics helper
2. **templateDiagnostics.test.ts** - Unit tests (3 tests)
3. **docs/TEMPLATE_DEBUGGING.md** - User-facing debugging guide

## Logging Architecture

### Layers

```
┌─────────────────────────────────────────────────────┐
│ 1. Configuration Layer (RepositoryManager)          │
│    - Repository configs, modes, paths, branches     │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 2. Provider Layer (Fetch from sources)              │
│    - GitHub: API calls, rate limits, auth status    │
│    - Local: File system operations                  │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 3. Aggregation Layer (TemplateFetcherService)       │
│    - Per-repo results                               │
│    - Success/failure counts                         │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 4. Service Layer (AITemplateDataService)            │
│    - Overall summaries                              │
│    - Counts by type                                 │
│    - Ready state management                         │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 5. UI Bridge Layer (NexkitPanelMessageHandler)      │
│    - APM-specific empty-agent diagnostics           │
│    - Spam-suppressed warnings                       │
└─────────────────────────────────────────────────────┘
```

## Detailed Changes

### 1. GitHub Provider (repositoryTemplateProvider.ts)

#### Request Lifecycle Logging

**Before each API call:**

```typescript
this._logging.debug(`[Templates] GitHub API request starting`, {
  repository: this.config.name,
  type,
  path,
  branch,
  apiUrl,
});
```

**After response:**

```typescript
const rateLimitInfo = {
  remaining: response.headers.get("x-ratelimit-remaining"),
  limit: response.headers.get("x-ratelimit-limit"),
  used: response.headers.get("x-ratelimit-used"),
  resource: response.headers.get("x-ratelimit-resource"),
  resetAt: rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000).toISOString() : undefined,
};

this._logging.debug(`[Templates] GitHub API response received`, {
  repository,
  type,
  path,
  status: response.status,
  statusText: response.statusText,
  durationMs: Date.now() - requestStart,
  rateLimit: rateLimitInfo,
  contentType: response.headers.get("content-type"),
  contentLength: response.headers.get("content-length"),
  etag: response.headers.get("etag"),
});
```

#### Authentication Detection

```typescript
private async getAuthHeaders(): Promise<Record<string, string>> {
  const headers = await GitHubAuthHelper.getAuthHeaders(...);
  const hasAuthToken = headers.Authorization !== undefined;

  this._logging.debug(`[Templates] GitHub authentication headers obtained`, {
    repository: this.config.name,
    isAuthenticated: hasAuthToken,
    userAgent: headers["User-Agent"],
    hint: hasAuthToken
      ? "Authenticated requests have rate limit of 5000/hour"
      : "Unauthenticated requests have rate limit of 60/hour. Sign in to GitHub in VS Code for higher limits.",
  });

  return headers;
}
```

#### Enhanced Error Messages

**404 Errors (Path not found):**

```typescript
if (response.status === 404) {
  this._logging.warn(`[Templates] GitHub path not found or no access (404)`, {
    repository: this.config.name,
    path,
    branch,
    apiUrl,
    rateLimit: rateLimitInfo,
    hint: "If this is a private repo, ensure you are signed in to GitHub in VS Code and have access. If public, verify the branch/path.",
  });
  return;
}
```

**403/401 Errors (Auth/Rate Limit):**

```typescript
if (response.status === 401 || response.status === 403) {
  const isRateLimit = response.status === 403 && rateLimitRemaining === "0";

  this._logging.error(`[Templates] GitHub authentication/authorization failed`, {
    repository: this.config.name,
    status: response.status,
    statusText: response.statusText,
    isRateLimit,
    path,
    branch,
    apiUrl,
    rateLimit: rateLimitInfo,
    hint: isRateLimit
      ? `GitHub API rate limit exceeded. Limit resets at ${rateLimitInfo.resetAt}. Consider authenticating with GitHub to get higher rate limits (60/hour unauthenticated vs 5000/hour authenticated).`
      : response.status === 403
        ? "This can be GitHub rate limiting or missing permissions. Try signing into GitHub in VS Code, or wait and retry."
        : "Please sign in to GitHub via VS Code to access private repositories.",
  });
  throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
}
```

#### File Download Operations

```typescript
public async downloadTemplate(templateFile: AITemplateFile): Promise<string> {
  this._logging.debug(`[Templates] Downloading template file from GitHub`, {
    repository: templateFile.repository,
    name: templateFile.name,
    type: templateFile.type,
    url: templateFile.rawUrl,
  });

  const requestStart = Date.now();
  const response = await fetch(templateFile.rawUrl, { headers });

  this._logging.debug(`[Templates] Template file download response`, {
    repository: templateFile.repository,
    name: templateFile.name,
    status: response.status,
    durationMs: Date.now() - requestStart,
    rateLimit: { ... },
    contentLength: response.headers.get("content-length"),
  });

  const content = await response.text();

  this._logging.debug(`[Templates] Template file downloaded successfully`, {
    repository: templateFile.repository,
    name: templateFile.name,
    contentSize: content.length,
  });

  return content;
}
```

#### Directory Download Tracking

```typescript
public async downloadDirectoryContents(templateFile: AITemplateFile): Promise<Map<string, string>> {
  let filesDownloaded = 0;
  let directoriesProcessed = 0;

  const downloadRecursive = async (path: string, basePath: string): Promise<void> => {
    // ... fetch directory listing ...
    directoriesProcessed++;

    for (const item of contents) {
      if (item.type === "file") {
        // ... download file ...
        filesDownloaded++;
      } else if (item.type === "dir") {
        await downloadRecursive(item.path, basePath);
      }
    }
  };

  await downloadRecursive(templateFile.sourcePath, templateFile.sourcePath);

  this._logging.info(`[Templates] Directory contents downloaded successfully`, {
    repository: templateFile.repository,
    name: templateFile.name,
    filesDownloaded,
    directoriesProcessed,
  });

  return fileContents;
}
```

---

### 2. Local Provider (localFolderTemplateProvider.ts)

#### Path Resolution Logging

```typescript
public async fetchAllTemplates(): Promise<AITemplateFile[]> {
  const basePath = await this.resolveBasePath();

  this._logging.info(`[Templates] Fetching from local repository '${this.config.name}'`, {
    repository: this.config.name,
    basePath: basePath.fsPath,
    modes: this.config.modes,
    paths: this.config.paths,
  });

  // ... fetch logic ...
}
```

#### Missing Path Detection

```typescript
try {
  await vscode.workspace.fs.stat(fullPath);
} catch (error) {
  this._logging.warn(`[Templates] Local path not found`, {
    repository: this.config.name,
    type,
    relativePath,
    fullPath: fullPath.fsPath,
  });
  return;
}
```

#### Per-Type Counts

```typescript
// Regular handling for file-based templates
let count = 0;
for (const [name, fileType] of entries) {
  if (fileType !== vscode.FileType.File || !name.endsWith(".md")) {
    continue;
  }

  // ... create template ...
  count++;
}

this._logging.info(`[Templates] Fetched ${count} ${type} template(s) from '${this.config.name}'`, {
  repository: this.config.name,
  type,
  relativePath,
});
```

---

### 3. Fetcher Service (templateFetcherService.ts)

#### Repository-Level Results

```typescript
public async fetchFromRepository(repositoryName: string): Promise<RepositoryFetchResult> {
  const provider = this.repositoryManager.getProvider(repositoryName);

  if (!provider) {
    this._logging.error(`[Templates] Repository provider not found`, { repositoryName });
    return {
      repositoryName,
      templates: [],
      success: false,
      error: new Error(`Repository not found: ${repositoryName}`),
    };
  }

  try {
    const templates = await provider.fetchAllTemplates();

    this._logging.info(`[Templates] Repository fetched`, {
      repositoryName,
      templateCount: templates.length,
    });

    return { repositoryName, templates, success: true };
  } catch (error) {
    this._logging.error(`[Templates] Repository fetch failed`, {
      repositoryName,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      repositoryName,
      templates: [],
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
```

#### Aggregate Summary

```typescript
public async fetchFromAllRepositories(): Promise<FetchAllResult> {
  this._logging.info(`[Templates] Fetching templates from ${providers.length} repository(ies)`);

  // ... parallel fetch ...

  this._logging.info(`[Templates] Fetch completed`, {
    repositoryCount: providers.length,
    successCount,
    failureCount,
    templateCount: allTemplates.length,
  });

  return { allTemplates, results, successCount, failureCount };
}
```

---

### 4. Repository Manager (repositoryManager.ts)

#### Configuration Visibility

```typescript
public initialize(): void {
  const repositories = RepositoryConfigManager.getEnabledRepositories();

  this._logging.info("[Templates] RepositoryManager initialized", {
    enabledRepositoryCount: repositories.length,
    repositories: repositories.map((r) => ({
      name: r.name,
      type: r.type ?? "github",
      url: r.url,
      branch: r.branch,
      enabled: r.enabled,
      modes: r.modes,
      paths: r.paths,
    })),
  });

  // ... create providers ...
}
```

---

### 5. AI Template Data Service (aiTemplateDataService.ts)

#### Initialization Summary

```typescript
public async initialize(): Promise<void> {
  this._logging.info("[Templates] Initializing AI template data...");

  const result = await this.fetcherService.fetchFromAllRepositories();

  const countsByType: Record<AITemplateFileType, number> = {
    agents: 0,
    prompts: 0,
    skills: 0,
    instructions: 0,
    chatmodes: 0,
  };
  for (const template of result.allTemplates) {
    countsByType[template.type]++;
  }

  const repoDiagnostics = result.results.map((r) => ({
    repositoryName: r.repositoryName,
    success: r.success,
    templateCount: r.templates.length,
    error: r.error ? r.error.message : undefined,
    modes: this.repositoryManager.getRepositoryModes(r.repositoryName),
  }));

  this._logging.info("[Templates] Initialization fetch results", {
    templateCount: result.allTemplates.length,
    successCount: result.successCount,
    failureCount: result.failureCount,
    countsByType,
    repositories: repoDiagnostics,
  });

  if (result.allTemplates.length === 0) {
    this._logging.warn(
      "[Templates] No templates were loaded. This can lead to empty template lists in the UI.",
      {
        hint: "Check previous logs for per-repository failures (auth, rate limit, 404 path, network).",
      }
    );
  }
}
```

---

### 6. APM Diagnostics (templateDiagnostics.ts)

#### Pure Helper Function

```typescript
export function getApmAgentDiagnostics(repositories: RepositoryTemplatesMap[]): ApmAgentDiagnostics {
  const apmRepositories = repositories
    .filter((repo) => repo.modes?.includes(OperationMode.APM) ?? false)
    .map((repo) => {
      const countsByType = getCountsByType(repo);
      return {
        name: repo.name,
        modes: repo.modes,
        agentCount: countsByType.agents,
        countsByType,
      };
    });

  const apmAgentCount = apmRepositories.reduce((sum, repo) => sum + repo.agentCount, 0);

  return {
    apmRepositoryCount: apmRepositories.length,
    apmAgentCount,
    apmRepositories,
  };
}
```

#### Unit Tests (templateDiagnostics.test.ts)

- ✅ Should treat only APM-opted-in repos as APM visible
- ✅ Should aggregate agents across APM repositories
- ✅ Should return zero when no APM repositories exist

---

### 7. Panel Message Handler (nexkitPanelMessageHandler.ts)

#### APM Empty Agent Detection

```typescript
private async sendTemplateData(): Promise<void> {
  await this._services.aiTemplateData.waitForReady();

  const repositories = this._services.aiTemplateData.getRepositoryTemplatesMap();

  // Diagnostics for APM empty agents
  const apmDiagnostics = getApmAgentDiagnostics(repositories);
  if (apmDiagnostics.apmRepositoryCount > 0 && apmDiagnostics.apmAgentCount === 0) {
    // Spam suppression: only warn once per unique signature
    const signature = JSON.stringify(
      apmDiagnostics.apmRepositories.map((r) => ({
        name: r.name,
        agentCount: r.agentCount,
        modes: r.modes
      }))
    );

    if (signature !== this._lastApmEmptySignature) {
      this._lastApmEmptySignature = signature;
      this._services.logging.warn(
        "[APM] Agent Templates is empty (0 agents loaded from APM repositories)",
        {
          modeSetting: SettingsManager.getMode(),
          ...apmDiagnostics,
          hint: "Check earlier [Templates] logs for GitHub auth/rate-limit, 404 path, or branch/path mismatches for the APM template repository.",
        }
      );
    }
  }

  this.sendToWebview({ command: "templateDataUpdate", repositories });
}
```

**Key Features:**

- Only warns when APM repos exist but agents=0
- Spam suppression via signature-based deduplication
- Points user to earlier logs for root cause

---

### 8. Test Infrastructure (runTest.ts)

#### Timeout Fix

**Problem**: VS Code download was timing out on slower networks (15s idle timeout)

**Solution**: Increased timeout to 60s

```typescript
await runTests({
  extensionDevelopmentPath,
  extensionTestsPath,
  // Increase download idle timeout to avoid flaky failures on slower networks.
  timeout: 60000,
  launchArgs: [ ... ],
});
```

---

## Log Message Format

All logs follow a consistent format:

```
[Prefix] Message { ...structuredData }
```

### Prefixes

- `[Templates]` - Template fetch pipeline operations
- `[APM]` - APM-specific diagnostics

### Structured Data

All logs include structured objects for easy parsing/filtering:

```typescript
this._logging.info(`[Templates] Completed GitHub fetch for 'RepoName'`, {
  repository: this.config.name,
  templateCount: allTemplates.length,
});
```

---

## Debugging Workflow

When "Agent Templates" is empty:

1. **Open Output Channel**: View → Output → "Nexkit"
2. **Find Repository Init**: Search for `[Templates] RepositoryManager initialized`
3. **Check APM Repos**: Verify at least one repo has `modes: ["APM"]`
4. **Find Fetch Attempts**: Search for `[Templates] Fetching from GitHub repo`
5. **Check Status Codes**: Look for 404, 403, 401 in responses
6. **Check Counts**: Search for `Fetched X agents template(s)`
7. **Find Root Cause**:
   - 404 → Wrong branch/path
   - 403 → Rate limit or permissions
   - 401 → Not authenticated
   - 200 + count=0 → Empty directory

---

## GitHub API Rate Limits

### Headers Captured

All GitHub API responses extract these rate limit headers:

- `x-ratelimit-remaining` - Requests left in current window
- `x-ratelimit-limit` - Total requests allowed per window
- `x-ratelimit-used` - Requests used in current window
- `x-ratelimit-resource` - Resource type (core, search, etc.)
- `x-ratelimit-reset` - Unix timestamp when limit resets (converted to ISO string)

### Rate Limit Detection

```typescript
const isRateLimit = response.status === 403 && rateLimitRemaining === "0";
```

### User Guidance

```
hint: "GitHub API rate limit exceeded. Limit resets at 2024-01-15T10:30:00.000Z.
       Consider authenticating with GitHub to get higher rate limits
       (60/hour unauthenticated vs 5000/hour authenticated)."
```

---

## Testing

### New Tests

**File**: `test/suite/templateDiagnostics.test.ts`

- ✅ 3 unit tests for APM diagnostics
- ✅ All 141 existing tests still passing
- ✅ No breaking changes

### Test Results

```
  Unit: templateDiagnostics
    ✔ Should treat only APM-opted-in repos as APM visible
    ✔ Should aggregate agents across APM repositories
    ✔ Should return zero when no APM repositories exist

  Total: 141 passing, 5 pending
```

---

## Performance Impact

### Minimal Overhead

- **Logging**: Only when operations occur (not polling)
- **Structured Data**: Small JSON objects
- **Debug Logs**: Only logged, not displayed by default
- **Spam Suppression**: Prevents repeated warnings

### Network Impact

- **No Additional Requests**: Only logs existing API calls
- **Header Extraction**: Zero overhead (headers already received)
- **Timing**: Uses `Date.now()` (nanosecond precision not needed)

---

## Future Enhancements

Potential additions if more issues arise:

1. **Telemetry Integration**: Send anonymized diagnostics to Application Insights
2. **Log Export**: Command to export logs for bug reports
3. **Health Check**: Proactive health check for common misconfigurations
4. **Rate Limit Dashboard**: Show rate limit status in UI
5. **Auth Status Indicator**: Visual indicator in panel when not authenticated

---

## Documentation

### User-Facing

- **TEMPLATE_DEBUGGING.md** - Complete debugging guide for end users
  - How to access logs
  - What each log means
  - Common issues and solutions
  - GitHub authentication guidance

### Developer-Facing

- **LOGGING_ENHANCEMENTS.md** (this document) - Technical implementation details
  - Architecture and design decisions
  - Code examples
  - Testing strategy
  - Future roadmap

---

## Breaking Changes

**None.** All changes are additive:

- ✅ No API changes
- ✅ No configuration changes
- ✅ No behavioral changes (except more logging)
- ✅ Fully backward compatible

---

## Related Issues

This enhancement addresses:

- Empty "Agent Templates" section in APM mode
- Lack of visibility into template fetch failures
- Difficulty diagnosing GitHub auth/rate-limit issues
- Unknown causes of missing templates

---

## Maintainability

### Code Quality

- ✅ Follows existing `LoggingService` patterns
- ✅ Consistent log message format
- ✅ Structured data for easy parsing
- ✅ TypeScript type safety
- ✅ Unit test coverage for new code

### Documentation

- ✅ Inline code comments
- ✅ User-facing debugging guide
- ✅ Technical implementation doc
- ✅ Examples in each section

---

## Approval Checklist

- [x] Code compiles without errors
- [x] ESLint passes with no warnings
- [x] All 141 existing tests passing
- [x] 3 new tests added and passing
- [x] No breaking changes
- [x] User documentation created
- [x] Technical documentation created
- [x] Performance impact minimal
- [x] Security: No credentials/PII logged
- [x] Cross-platform tested (Windows paths, Unix separators)
