# Squad Team

> Equipe Laurence — Nethris-to-SharePoint Azure Function Pipeline

## Coordinator

| Name  | Role        | Notes                                              |
| ----- | ----------- | -------------------------------------------------- |
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name     | Role                              | Charter                             | Status    |
| -------- | --------------------------------- | ----------------------------------- | --------- |
| Morpheus | Lead / Architect                  | `.squad/agents/morpheus/charter.md` | 🟢 Active  |
| Neo      | Backend Dev                       | `.squad/agents/neo/charter.md`      | 🟢 Active  |
| Trinity  | Tester / QA                       | `.squad/agents/trinity/charter.md`  | 🟢 Active  |
| Tank     | DevOps                            | `.squad/agents/tank/charter.md`     | 🟢 Active  |
| Dozer    | Azure Engineer                    | `.squad/agents/dozer/charter.md`    | 🟢 Active  |
| Cypher   | Nethris API Specialist            | `.squad/agents/cypher/charter.md`   | 🟢 Active  |
| Switch   | SharePoint & Graph API Specialist | `.squad/agents/switch/charter.md`   | 🟢 Active  |
| Mouse    | Twilio Integration Specialist     | `.squad/agents/mouse/charter.md`    | 🟢 Active  |
| Oracle   | Project Manager                   | `.squad/agents/oracle/charter.md`   | 🟢 Active  |
| Link | TypeScript & VS Code Extension Dev | `.squad/agents/link/charter.md` | 🟢 Active |
| Ghost | Preact & Webview UI Dev | `.squad/agents/ghost/charter.md` | 🟢 Active |
| Scribe | Scribe | `.squad/agents/scribe/charter.md` | 🟢 Active |
| Ralph | Work Monitor | `.squad/agents/ralph/charter.md` | 🔄 Monitor |

## Human Members

| Name           | Role     | Badge   | Responsibilities                                                                                                     |
| -------------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| Eric Decarufel | Reviewer | 👤 Human | Reviews tasks in the GitHub project that are "In Review" status. Final approval gate before work is considered done. |

## Coding Agent

<!-- copilot-auto-assign: true -->

| Name     | Role         | Charter | Status         |
| -------- | ------------ | ------- | -------------- |
| @copilot | Coding Agent | —       | 🤖 Coding Agent |

### Capabilities

**🟢 Good fit — auto-route when enabled:**

- Bug fixes with clear reproduction steps
- Test coverage (adding missing tests, fixing flaky tests)
- Lint/format fixes and code style cleanup
- Dependency updates and version bumps
- Small isolated features with clear specs
- Boilerplate/scaffolding generation
- Documentation fixes and README updates

**🟡 Needs review — route to @copilot but flag for squad member PR review:**

- Medium features with clear specs and acceptance criteria
- Refactoring with existing test coverage
- API endpoint additions following established patterns
- Migration scripts with well-defined schemas

**🔴 Not suitable — route to squad member instead:**

- Architecture decisions and system design
- Multi-system integration requiring coordination
- Ambiguous requirements needing clarification
- Security-critical changes (auth, encryption, access control)
- Performance-critical paths requiring benchmarking
- Changes requiring cross-team discussion

## Project Context

- **Owner:** Eric De Carufel
- **Project:** Azure Function that takes information from Nethris payroll reports and sends them to a SharePoint site. Highly testable with BDD using Gherkin. C# .NET 10.0. Multi-environment CI/CD (dev/test/prod).
- **Stack:** C#, .NET 10.0, Azure Functions, SharePoint, SpecFlow/Gherkin, GitHub Actions, Bicep
- **Budget:** 125 hours
- **Created:** 2026-04-24
