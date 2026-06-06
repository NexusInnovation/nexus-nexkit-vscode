# Work Routing

How to decide who handles what.

## Routing Table

| Work Type                 | Route To | Examples                                                                                                               |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| Architecture & design     | Morpheus | Solution structure, abstraction design, interface contracts, dependency injection                                      |
| Code review               | Morpheus | Review PRs, check quality, enforce testability patterns                                                                |
| Azure Functions & C# code | Neo      | Function triggers, service implementation, Nethris parsing, SharePoint integration                                     |
| Data models & services    | Neo      | DTOs, business logic services, data transformation                                                                     |
| BDD & testing             | Trinity  | Gherkin scenarios, step definitions, unit tests, mock setup                                                            |
| Test framework            | Trinity  | SpecFlow setup, test architecture, coverage                                                                            |
| TypeScript & VS Code extension | Link | Extension services, VS Code API, commands, settings, ServiceContainer, SettingsManager, unit tests for extension layer |
| Preact & webview UI       | Ghost    | Preact components, hooks, AppState, webview message handling, TSX, webview CSS                                          |
| CI/CD & deployment        | Tank     | GitHub Actions workflows, build pipelines, multi-env deployment                                                        |
| SharePoint & Graph API    | Switch   | `SharePointClient`, `GraphServiceClient` DI, upload logic, metadata, `Sites.Selected` permissions                      |
| Twilio & SMS              | Mouse    | `TwilioSmsClient`, `SendEmergencySmsFunction`, `TwilioInboundWebhookFunction`, opt-out, idempotency, audit, compliance |
| Bicep & Azure IaC         | Dozer    | Bicep templates, Azure resource design, `infra/main.bicep`, `.bicepparam` files                                        |
| Azure Functions config    | Dozer    | `host.json`, function bindings, app settings, managed identity, Key Vault references, App Configuration                |
| Budget & planning         | Oracle   | Hour tracking, work breakdown, risk management, priorities                                                             |
| Scope & priorities        | Oracle   | What to build next, trade-offs, budget impact                                                                          |
| Session logging           | Scribe   | Automatic — never needs routing                                                                                        |

## Issue Routing

| Label          | Action                                               | Who          |
| -------------- | ---------------------------------------------------- | ------------ |
| `squad`        | Triage: analyze issue, assign `squad:{member}` label | Lead         |
| `squad:{name}` | Pick up issue and complete the work                  | Named member |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, the **Lead** triages it — analyzing content, assigning the right `squad:{member}` label, and commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by removing their label and adding another member's label.
4. The `squad` label is the "inbox" — untriaged issues waiting for Lead review.

## Human Reviewer Routing

| Signal                                          | Action                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| Task moves to "In Review" in the GitHub project | Notify Eric Decarufel — present the work and wait for his approval               |
| Eric approves                                   | Close review, mark done, proceed with merge/next steps                           |
| Eric requests changes                           | Route feedback to the original author agent (Reviewer Rejection Lockout applies) |
| PR ready for human review                       | Tag Eric on the PR — do not auto-merge until he approves                         |

## GitHub Project Status Updates

**MANDATORY:** All agents working on GitHub issues MUST update the project board status at each lifecycle point. See `.squad/skills/gh-project-status/SKILL.md` for the full reference (IDs, commands, examples).

| Event                    | Status        |
| ------------------------ | ------------- |
| Triage assigns issue     | → Ready       |
| Agent starts working     | → In progress |
| PR opened                | → In review   |
| PR merged / issue closed | → Done        |

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn the tester to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. The Lead handles all `squad` (base label) triage.
8. **Project status** — every agent spawned for issue work MUST update the GitHub project status. Include the skill reference in every issue-related spawn prompt.
