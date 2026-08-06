# Session Log — DevOps Branch Creation telemetry fix

**Timestamp:** 2026-08-06T14:00:00Z

Link fixed the `resolutionSource="activeConnection"` telemetry bug in `devOpsBranchCreationService.ts`: the
single-inactive-connection case now actually activates the connection via `setActiveConnection()` before
reporting `"activeConnection"`, instead of reporting it inaccurately. 3 new tests added.

**Verification:** 447 passing, 8 pending, 0 failing; `check:types` clean.
