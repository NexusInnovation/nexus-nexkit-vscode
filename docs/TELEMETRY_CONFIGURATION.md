# Telemetry Configuration Guide

This document explains how to configure telemetry for the Nexkit VS Code extension.

## Overview

The extension uses **Azure Application Insights** for telemetry, tracking:

- Extension activation/deactivation
- Command executions
- Errors and exceptions
- Performance metrics
- User interactions with the webview panel

## Default Settings

Telemetry is **enabled by default** with the following settings:

```json
{
  "nexkit.telemetry.enabled": true,
  "nexkit.telemetry.connectionString": "InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=https://region.in.applicationinsights.azure.com/;LiveEndpoint=https://region.livediagnostics.monitor.azure.com/;ApplicationId=00000000-0000-0000-0000-000000000000"
}
```

## Connection String Format

Azure Application Insights connection strings follow this format:

```
InstrumentationKey=<GUID>;IngestionEndpoint=https://<region>.in.applicationinsights.azure.com/;LiveEndpoint=https://<region>.livediagnostics.monitor.azure.com/;ApplicationId=<GUID>
```

### Example Connection String

```
InstrumentationKey=12345678-1234-1234-1234-123456789abc;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/;ApplicationId=87654321-4321-4321-4321-cba987654321
```

### Required Components

1. **InstrumentationKey**: A GUID that identifies your Application Insights resource (legacy but still supported)
2. **IngestionEndpoint**: The endpoint where telemetry data is sent (includes Azure region)
3. **LiveEndpoint**: The endpoint for live metrics streaming (includes Azure region)
4. **ApplicationId**: A GUID that identifies your application in Azure

### Finding Your Connection String

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to your Application Insights resource
3. In the left menu, select **Overview**
4. Find **Connection String** in the Essentials section
5. Copy the entire connection string

## Configuration Priority

The extension resolves the connection string in this order:

1. **Environment Variable** (highest priority)
   - `APPLICATIONINSIGHTS_CONNECTION_STRING`
   - Used for development/testing

2. **VS Code Settings**
   - `nexkit.telemetry.connectionString`
   - Set in user settings or workspace settings
   - **This is the recommended method for production**

3. **No telemetry** (if no connection string found)
   - Extension will log: "Nexkit telemetry: No connection string found"

## Updating the Connection String

### Method 1: Update package.json default value

Edit `package.json` and replace the placeholder:

```json
"nexkit.telemetry.connectionString": {
  "type": "string",
  "default": "InstrumentationKey=YOUR-KEY-HERE;IngestionEndpoint=https://YOUR-REGION.in.applicationinsights.azure.com/;LiveEndpoint=https://YOUR-REGION.livediagnostics.monitor.azure.com/;ApplicationId=YOUR-APP-ID-HERE",
  "scope": "application",
  "description": "Azure Application Insights connection string. Replace with your actual connection string from Azure Portal."
}
```

### Method 2: Use Environment Variable (Development)

Set the environment variable before launching VS Code:

**Windows (PowerShell):**

```powershell
$env:APPLICATIONINSIGHTS_CONNECTION_STRING = "InstrumentationKey=..."
code .
```

**macOS/Linux (Bash):**

```bash
export APPLICATIONINSIGHTS_CONNECTION_STRING="InstrumentationKey=..."
code .
```

### Method 3: User Settings (Override)

Users can override the default in their VS Code settings:

1. Open VS Code Settings (Ctrl+,)
2. Search for "nexkit telemetry"
3. Paste your connection string in "Telemetry: Connection String"

Or edit `settings.json` directly:

```json
{
  "nexkit.telemetry.connectionString": "InstrumentationKey=..."
}
```

## What Gets Tracked

### Automatic Error Tracking

All errors are automatically tracked:

1. **Command Errors**: Any error in a registered command
2. **Webview Errors**: Template installation, profile operations, etc.
3. **Initialization Errors**: Template data loading, service initialization
4. **Unhandled Errors**: Unhandled promise rejections and exceptions

### Error Properties

Each error includes:

- `extensionVersion`: Extension version number
- `vscodeVersion`: VS Code version
- `platform`: Operating system (win32, darwin, linux)
- `nodeVersion`: Node.js version
- `sessionId`: Unique session identifier
- `username`: OS username
- `ipAddress`: Public IP address (fetched with timeout)
- `timestamp`: ISO timestamp
- `context`: Where the error occurred (e.g., "webview.installTemplate")
- Stack trace and error message

### Events Tracked

- `extension.activated`: Extension activation (with duration)
- `extension.deactivated`: Extension deactivation (with session duration)
- `command.executed`: Command executions (with duration and success status)
- `chat.command.executed`: Copilot chat command usage
- Custom events: Various feature-specific events

## Privacy & User Consent

### VS Code Telemetry Level

The extension **respects VS Code's global telemetry setting**:

```json
{
  "telemetry.telemetryLevel": "off" // Disables ALL telemetry
}
```

If VS Code telemetry is set to `"off"`, Nexkit telemetry will also be disabled, regardless of the Nexkit-specific setting.

### Nexkit Telemetry Setting

Users can disable Nexkit telemetry specifically:

```json
{
  "nexkit.telemetry.enabled": false
}
```

### What is NOT Collected

The extension does **NOT** collect:

- File names, paths, or contents
- Project names or workspace paths
- Configuration values (beyond what's needed for telemetry itself)
- Sensitive user data

### What IS Collected (PII)

⚠️ **Privacy Notice**: The extension collects the following personally identifiable information (PII):

- **OS Username**: Retrieved via `os.userInfo().username`
- **Public IP Address**: Fetched from `https://api.ipify.org` with a 5-second timeout

**Ensure compliance** with privacy regulations (GDPR, CCPA, etc.) before deploying to production.

## Testing Telemetry

### Verify Connection

1. Open VS Code Developer Tools: **Help → Toggle Developer Tools**
2. Go to the Console tab
3. Look for log messages:
   - ✅ "Nexkit telemetry initialized successfully (live mode)"
   - ❌ "Nexkit telemetry is disabled"
   - ❌ "Nexkit telemetry: No connection string found"

### Test Error Tracking

Trigger an error and check that it's logged:

```typescript
// In the console
Error: Test error
    at ...
```

Then check Application Insights in Azure Portal:

- Go to **Logs** → **Exceptions**
- Look for recent exceptions with your session ID

### Monitor Live Metrics

1. Go to Azure Portal → Your Application Insights resource
2. Click **Live Metrics** in the left menu
3. Perform actions in VS Code
4. See real-time telemetry data

## Troubleshooting

### "No connection string found"

**Cause**: No valid connection string configured

**Solution**:

1. Check `package.json` for default value
2. Or set `nexkit.telemetry.connectionString` in VS Code settings
3. Or set `APPLICATIONINSIGHTS_CONNECTION_STRING` environment variable

### Telemetry not appearing in Azure

**Possible Causes**:

1. Invalid connection string format
2. Network connectivity issues
3. Azure Application Insights resource not created
4. Telemetry disabled in settings

**Diagnostics**:

1. Check Developer Tools console for errors
2. Verify connection string format
3. Test network connectivity to `*.applicationinsights.azure.com`
4. Verify `nexkit.telemetry.enabled` is `true`
5. Verify VS Code `telemetry.telemetryLevel` is not `"off"`

### IP Address shows "unavailable"

**Cause**: Network request to `api.ipify.org` failed or timed out

**Impact**: Minimal - telemetry still works, just without IP address

**Note**: This is expected in offline or restricted network environments

## Production Deployment

### Before Release Checklist

- [ ] Replace placeholder connection string in `package.json`
- [ ] Test telemetry in development environment
- [ ] Verify telemetry data appears in Azure Portal
- [ ] Update privacy policy/EULA with PII collection notice
- [ ] Verify compliance with privacy regulations (GDPR, CCPA)
- [ ] Document telemetry opt-out process in README

### Recommended Settings

For production release:

```json
{
  "nexkit.telemetry.enabled": true,
  "nexkit.telemetry.connectionString": "<YOUR-PRODUCTION-CONNECTION-STRING>"
}
```

### Environment-Specific Configuration

Use different connection strings for different environments:

- **Development**: Use environment variable
- **Staging**: Use separate Application Insights resource
- **Production**: Use production connection string in `package.json`

## Related Files

- `package.json`: Configuration schema and default values
- `src/shared/services/telemetryService.ts`: Telemetry service implementation
- `src/core/settingsManager.ts`: Settings access layer
- `src/extension.ts`: Global error handling setup
- `src/shared/commands/commandRegistry.ts`: Command error tracking

## References

- [Azure Application Insights](https://docs.microsoft.com/azure/azure-monitor/app/app-insights-overview)
- [Application Insights Node.js SDK](https://github.com/microsoft/ApplicationInsights-node.js)
- [VS Code Telemetry API](https://code.visualstudio.com/api/extension-capabilities/common-capabilities#telemetry)
