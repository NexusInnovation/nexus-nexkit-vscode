# GitHub Private Repository Download Fix

## Problem
The original `fetchWithRedirects` method in `githubReleaseService.ts` was failing to download files from private GitHub repositories because it would remove the Authorization header when the host changed during redirects.

## Root Cause
```typescript
// Problematic code in original implementation:
if (headers['Authorization'] && nextHost !== originalHost) {
  delete headers['Authorization']; // This breaks private repo downloads!
}
```

## Solution
1. **Created `fetchWithRedirectsPrivateRepo` method** that keeps Authorization for GitHub domains
2. **Enhanced `downloadVsixAsset` method** to use GitHub API endpoints instead of browser URLs
3. **Added fallback strategy** for maximum compatibility

## Code Changes

### New Method: `fetchWithRedirectsPrivateRepo`
- Maintains Authorization header for GitHub-related domains
- Only removes auth when redirecting to external storage providers
- Supports domains: `github.com`, `api.github.com`, `codeload.github.com`, `objects-origin.githubusercontent.com`

### Enhanced: `downloadVsixAsset`
- Uses GitHub API endpoint: `/repos/{owner}/{repo}/releases/assets/{asset_id}`
- Sets proper `Accept: application/octet-stream` header
- Falls back to direct URL if API approach fails

### Added: Helper Methods
- `getAssetIdFromRelease` - Gets asset ID from GitHub API
- `downloadViaDirectUrl` - Fallback download method

## Testing
Created comprehensive test suite in `githubDownloadTest.ts` that:
- Tests direct URL downloads with auth headers
- Compares old vs new redirect handling approaches
- Verifies binary download integrity
- Provides diagnostic information for troubleshooting

## Usage
The fix is transparent - existing code calling `downloadVsixAsset()` will automatically use the improved implementation.

## Benefits
1. ✅ **Fixed private repository downloads** - Proper auth handling throughout redirect chain
2. ✅ **Improved reliability** - Uses official GitHub API endpoints when possible
3. ✅ **Backward compatibility** - Fallback to original approach if needed
4. ✅ **Better error handling** - More specific error messages and retry logic
5. ✅ **Security** - Still removes auth headers when going to external domains