# Project Context

- **Project:** Equipe Laurence
- **Created:** 2026-04-24

## Core Context

Agent Ralph initialized and ready for work.

## Recent Updates

📌 Team initialized on 2026-04-24

### Session — 2026-05-20 (SMS provider plug-n-play backlog)

**Completed:**
- **#106** — Closed (SmsOptions + GetSmsProvider merged via PR #114 in prior session)
- **#105** — SPIKE Twilio research completed; findings posted as issue comment; closed
- **#107** — Infrastructure.Acs project created (PR #115 → merged ✅); AcsSmsClient + AcsOptions migrated from Core/Infrastructure; 5 AcsSmsClientTests pass; AcsOptions validation tests added
- **#108** — Infrastructure.Twilio project created (PR #116 open); TwilioSmsClient implemented with ITwilioRestClient injection for testability; 9 tests; FunctionAppStartup wired; all 197 tests pass
- **#109** — Closed as complete (SMS provider selection fully wired: Twilio→TwilioSmsClient, Acs→AcsSmsClient, default→DisabledSmsClient)

**Open PRs:**
- PR #116: feat(#108) Infrastructure.Twilio — awaiting review/merge

**Remaining open issues (all go:needs-research or blocked):**
- #113 Docs (go:yes, blocked by #112)
- #112 Bicep separation by SMS provider (go:needs-research)
- #111 Remove direct ACS dependency from Functions (go:needs-research)
- #110 Inbound SMS abstraction / TwilioInboundSmsFunction (go:needs-research)

### Session — 2026-05-20 (EntraID SMS auth backlog)

**Completed:**
- **#125** — Closed as duplicate of #126; project board → Done
- **#129** — Message de confirmation SMS (mode non-fonctionnel): implemented warning banner (yellow) + JS confirm dialog in `SmsFormFunction.cs`; PR #131 opened → develop; board → In review
- **#126** — Middleware EntraID: delegated to Neo (branch `feature/126-entraid-sms-auth`); PR #132 opened → develop; board → In review
- **#128** — Infrastructure Bicep authsettingsV2 Entra ID Easy Auth: delegated to Dozer (branch `feature/128-bicep-entraid-auth`); PR #133 opened → develop; board → In review

**Blocked (awaiting #126 merge):**
- #127 — remains blocked
- #130 — remains blocked

**Open PRs after this round:**
- PR #131: feat(#129) SMS confirmation warning banner
- PR #132: feat(#126) EntraID authentication on SMS endpoints
- PR #133: feat(#128) Bicep authsettingsV2 Easy Auth

## Learnings

- Twilio 7.6.2 not available in NuGet; use 7.7.0
- `ApiException` ctor in Twilio v7.7.0: `(int code, int status, string message, string moreInfo, Dictionary<string, object> details, Exception originalException)`
- `ITwilioRestClient.Region` is non-nullable `string` in Twilio v7.7.0 — cannot return null from mock
- `MessageResource.CreateAsync(options, restClient)` does NOT throw on 4xx from mocked `ITwilioRestClient` — only real `RestClient` throws. Tests must throw `ApiException` directly via mock setup
- Twilio SDK `SmsSendResult` does not exist; it's an `ISmsClient` abstraction in Core
