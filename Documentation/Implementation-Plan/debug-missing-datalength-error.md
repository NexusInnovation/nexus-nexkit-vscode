# Fix: Debug "Missing dataLength in event" Error from Node Inspector

## Work Item

- **ID:** (not provided)
- **URL:** (not available)

## Context

The Nexkit VS Code extension includes a newly added RTF-to-Markdown converter feature (RTF/DOCX file upload and paste-to-Markdown conversion) that was added in the `copilot/add-rtf-to-markdown-converter-panel` branch. The converter webview requires four npm dependencies (`mammoth@1.12.0`, `turndown@7.2.4`, `turndown-plugin-gfm@1.0.2`, `rtf.js@3.0.9`).

When launching the extension in debug mode (F5), developers experience a severe performance issue: thousands of error messages flood the Debug Output panel stating:

```
Error: Missing dataLength in event
```

This originates from Node's internal inspector module (`node:inspector`) and repeats continuously during template fetching, making debugging nearly impossible and slowing down the debug environment significantly.

## Bug Description

**What happens:** When starting the extension in debug mode via `npm run watch` and pressing F5, VS Code's Extension Development Host starts normally, but then during the template fetch from GitHub repositories (approximately 30 seconds after activation), thousands of "Missing dataLength in event" errors begin flooding the Debug Output panel.

**Impact:**
- Debug session becomes unusably slow
- Error output is flooded with noise, making actual debugging impossible
- Performance degradation makes development experience poor
- Errors appear to originate from Node's debugger protocol, not application code

**How to reproduce:**
1. Checkout the branch `copilot/add-rtf-to-markdown-converter-panel`
2. Run `npm ci` to install all dependencies
3. Run `npm run watch` in one terminal
4. Press F5 to start debug mode in another terminal
5. Wait ~30 seconds for the extension to fetch templates from GitHub
6. Observe the Debug Output panel
7. See thousands of "Missing dataLength in event" errors appearing at regular intervals

**Expected behavior:** The debug session should start cleanly and allow templates to fetch without any debugger-level protocol errors.

**Actual behavior:** After template fetching begins, the debugger continuously reports "Missing dataLength in event" errors in a self-perpetuating cycle.

## Root Cause

The RTF converter dependencies are not the cause. `npm ci` resolved their build errors, but the `Missing dataLength in event` exceptions continued while the extension fetched GitHub templates and while Application Insights attempted to send telemetry.

The failure is an interaction between Node 24's inspector network instrumentation and Nexkit's exception telemetry:

1. A Node inspector-internal exception is raised with a stack beginning in `node:inspector` and `node:internal/inspector/network_http` whenever an HTTP response is observed by the debugger.
2. `src/extension.ts` registers an `uncaughtException` handler, so it catches that debugger-internal exception and passes it to `TelemetryService.trackError()`.
3. `trackError()` immediately calls `client.flush()`, creating an Application Insights HTTP request for the inspector to observe.
4. `applicationinsights@2.9.8` is simultaneously configured with `setAutoCollectExceptions(true)`. On Node 24 it registers its own `uncaughtExceptionMonitor`, so it also processes the inspector-internal exception and retries failed ingestion requests.
5. Each telemetry request or retry can trigger another inspector exception. Nexkit then logs and flushes that exception again, creating the repeated error loop.

The existing error sanitization is useful hardening, but it does not fix the cycle because the error itself is generated before Nexkit receives it. The log confirms this: the sanitized `Data` field is a plain string, while the exception stack remains entirely in Node inspector internals.

After the loop was fixed, a distinct exception appeared:

```
TypeError: e is not iterable
at ...\\extensions\\copilot\\dist\\extension.js
```

This is an internal GitHub Copilot extension failure, not a Nexkit failure. Its stack is entirely inside the VS Code-bundled Copilot extension. Nexkit does not call `vscode.lm` during startup, and startup verification explicitly skips the code that writes `chat.*` settings; the only Nexkit Language Model API call is in the user-invoked commit-message command.

Nexkit currently makes that external failure appear in the Nexkit Output channel because `process.on("uncaughtException")` and `process.on("unhandledRejection")` subscribe to the shared Extension Host process. Those handlers observe errors emitted by other extensions as well as Nexkit's own code.

## Implementation Steps

### Step 1: Filter Node inspector-internal exceptions before Nexkit logs or sends telemetry

In `src/extension.ts`, update `setupGlobalErrorHandling()` to classify an error as inspector-internal only when its message is `Missing dataLength in event` and its stack contains `node:inspector` or `node:internal/inspector/`.

Return from both the `unhandledRejection` and `uncaughtException` handlers before calling `LoggingService` or `TelemetryService` when this exact classification matches. Retain the existing sanitized-error path for every other exception.

**Expected observable result:** Debugger-internal protocol errors no longer generate Nexkit Output entries or trigger Application Insights HTTP flushes, breaking the feedback loop. Actual Nexkit errors continue to be sanitized, logged, and reported.

**Risks and constraints:** Keep the predicate deliberately narrow so application errors are never suppressed merely because their message contains the word `inspector`. Do not remove the process-level handlers; they remain responsible for genuine extension faults.

### Step 2: Disable Application Insights automatic exception collection in Nexkit telemetry initialization

In `src/shared/services/telemetryService.ts`, replace `setAutoCollectExceptions(true)` in `TelemetryService.initialize()` with the SDK configuration that disables automatic exception collection.

Nexkit already reports handled application errors through explicit `trackError()` calls. Disabling automatic collection prevents `applicationinsights@2.9.8` from registering `uncaughtExceptionMonitor` alongside Nexkit's global handlers on Node 24.

**Expected observable result:** Application Insights no longer observes and retries debugger-internal exceptions independently. Explicit Nexkit telemetry remains available for errors tracked through `TelemetryService.trackError()`.

**Risks and constraints:** Confirm that all known error-handling paths which need telemetry already call `trackError()`. Do not disable the user-controlled telemetry setting or remove the existing privacy checks.

### Step 3: Retain defensive serialization in the logging service only as a general hardening measure

In `src/shared/services/loggingService.ts`, keep or implement safe serialization for unknown diagnostic data so circular values and Buffers cannot throw while writing to the Nexkit Output channel.

**Expected observable result:** Logging a genuine application error with circular or binary metadata writes a readable fallback value and does not create a second exception.

**Risks and constraints:** This step must not be relied upon to suppress the inspector error. It must preserve ordinary JSON output and avoid logging raw user file contents, paths, or other sensitive values.

### Step 4: Restrict Nexkit global error reporting to Nexkit-owned exceptions

In `src/extension.ts`, replace the process-wide error handlers' unconditional logging and telemetry behavior with ownership filtering. Pass or close over the Nexkit extension root from activation, then report an unhandled rejection or uncaught exception only when its stack identifies Nexkit compiled source under that extension root. Return silently for exceptions whose stack identifies a different extension, including `extensions/copilot/dist/extension.js`.

Keep the existing narrow Node inspector filter from Step 1. It remains necessary because the inspector error has no Nexkit source frame, but it triggers telemetry recursion if reported.

**Expected observable result:** Copilot's `TypeError: e is not iterable` is no longer written to the Nexkit Output channel or sent as Nexkit telemetry. Actual unhandled Nexkit errors remain visible and reportable.

**Risks and constraints:** Do not claim to fix the Copilot exception in Nexkit code. The predicate must accept Windows and POSIX path separators and work for the compiled `out/` code path. Retain a safe fallback for Nexkit errors whose stack is unavailable only when an explicit Nexkit marker is available; do not attribute unknown shared-process errors to Nexkit.

## Documentation Updates

No existing technical-documentation page needs an update. The nexus-documentation template criteria do not justify a new Feature, Module, or User Scenario page because this is an internal telemetry/error-handling correction with no user-facing workflow or architecture change.

Create an issue with the VS Code/GitHub Copilot team or collect diagnostics from the Extension Development Host for the Copilot-owned `TypeError: e is not iterable`; this is external to the Nexkit repository and should not be documented as a Nexkit feature defect.

## Manual Test Plan

### TC-1: Verify debug session starts cleanly without repeated debugger protocol errors

**Why:** This test validates that filtering the inspector-internal exception and disabling the SDK's automatic exception monitor breaks the HTTP/telemetry feedback loop.

**Preconditions:**
- Code is on the `copilot/add-rtf-to-markdown-converter-panel` branch
- All implementation steps have been completed and compiled
- `npm run watch` is running in one terminal
- No ongoing debug sessions

**Steps:**

1. Press F5 to launch the Extension Development Host in debug mode
   - **Expected:** Debug session starts and Extension Development Host window opens

2. Wait 30-40 seconds for the extension to activate and fetch templates from GitHub repositories
   - **Expected:** The Nexkit output panel shows normal log messages (e.g., "[Templates] Fetching from GitHub repo 'Nexus Templates'", "[Templates] Fetched N agents template(s)...")

3. Check the Debug Output panel (the panel showing debug protocol messages, not the Nexkit output)
   - **Expected:** No repeated "Missing dataLength in event" errors; the output should be clean

4. Scroll through the Nexkit output panel and check for normal completion messages
   - **Expected:** See messages like "[Templates] Fetch completed" and "[Templates] AI template data ready" without interspersed "Missing dataLength in event" errors

5. Verify the Nexkit panel is functional: open the command palette (Ctrl+Shift+P) and look for Nexkit commands
   - **Expected:** Commands execute normally without errors

6. Close the debug session
   - **Expected:** Debug session closes cleanly without errors; Extension Development Host closes without issues

**Expected result:** The debug environment is usable and error-free. Developers can now debug the extension normally without performance degradation from circular error-handler loops. The template fetch completes successfully even in debug mode.

**Expected result:** The debug environment remains responsive while all GitHub template requests complete. Neither the Nexkit Output nor the Debug Output receives repeated `Missing dataLength in event` entries.

### TC-2: Preserve logging and explicit telemetry for a genuine application error

**Why:** The inspector filter must not silence genuine extension faults after automatic Application Insights exception collection is disabled.

**Preconditions:** The extension is running in the Extension Development Host with telemetry enabled, and an invalid repository configuration is available in the sandbox settings.

**Steps:**

1. Configure one template repository with an invalid GitHub URL or an invalid authenticated endpoint, then reload the Extension Development Host.
   - **Expected:** Nexkit logs the repository failure in its normal, readable format without emitting `Missing dataLength in event` repeatedly.
2. Wait for the remaining repositories to complete their fetch.
   - **Expected:** The extension remains responsive and successfully loads unaffected repositories.

**Expected result:** A real application failure is still visible in Nexkit logs and can be sent through the existing explicit telemetry paths, while inspector-internal errors do not restart the HTTP/telemetry loop.

### TC-3: Do not attribute a Copilot extension exception to Nexkit

**Why:** This verifies that Nexkit's process-wide handlers no longer record errors owned by another extension in the shared Extension Host process.

**Preconditions:** GitHub Copilot is enabled in the Extension Development Host and the test environment can reproduce or simulate an exception with a stack that identifies `extensions/copilot/dist/extension.js`.

**Steps:**

1. Start the Extension Development Host and wait for Copilot and Nexkit activation to complete.
   - **Expected:** Nexkit performs its normal template initialization without logging a Copilot-owned exception.
2. Reproduce the Copilot error or use a unit test to supply an error whose stack points to the Copilot extension path to Nexkit's ownership predicate.
   - **Expected:** The predicate classifies the error as external; no Nexkit log entry or Nexkit telemetry call occurs.

**Expected result:** External-extension failures remain diagnosable through their owning extension's logs, while the Nexkit Output channel contains only Nexkit-owned errors.

