# Project Context

- **Owner:** Eric De Carufel
- **Project:** Azure Function pipeline — Nethris payroll reports to SharePoint. C# .NET 10.0, BDD testing with
  Gherkin/SpecFlow, multi-environment CI/CD (dev/test/prod). 125-hour budget.
- **Stack:** C#, .NET 10.0, Azure Functions, SharePoint, SpecFlow/Gherkin, GitHub Actions
- **Created:** 2026-04-24

## Learnings

**Budget Allocation (2026-04-24):**

- Phase 1 (Hello World Foundation): 30 hours — lean scaffold to foundation quickly. Allocation supports 6-project structure,
  BDD framework, multi-env CI/CD, and basic manual testing.
- Phase 2 (Nethris Integration): 35 hours — largest allocation due to Nethris report parsing complexity and data model
  design.
- Phase 3 (SharePoint Integration): 40 hours — covers SharePoint client implementation, data transformation, and end-to-end
  testing.
- Phase 4 (Polish & Handoff): 20 hours — hardening, monitoring setup, documentation, and knowledge transfer.
- No explicit risk buffer built in; risks managed per risk register (R1–R5 identified for Phase 1).

**Phase 1 Hour Estimates by Role:**

- Morpheus (Architect): 7 hrs (design, review, standards, risk assessment)
- Neo (Backend Dev): 12 hrs (scaffold, endpoint, models, SpecFlow bindings, local dev)
- Trinity (QA/Tester): 6 hrs (BDD scenarios, testing checklists, manual tests, defect reporting)
- Tank (DevOps): 5 hrs (Bicep templates, GitHub Actions, multi-env provisioning)
- Total: 30 hrs for Phase 1

**Phase Structure & Risk Factors:**

- Scope creep flagged as highest risk (R5). Change control escalates to Eric for any Phase 1 adds.
- .NET 10 / Azure Function learning curve (R1) mitigated by early spike and pair programming.
- SpecFlow/xUnit integration (R2) managed via prototype in Week 1.
- Environment config drift (R4) addressed through Bicep parameterization and CI consistency checks.
- Milestone gates (M1–M6) enforce go/no-go reviews before advancing.

## Learnings

- Created 3 GitHub issues on 2026-05-06: SharePoint access denied (#14), Key Vault secret overwrite (#15), two-environment
  pipeline update (#16)

### 2026-05-12 — Documentation Translation (English → French)

Translated 7 of 8 `docs/` files from English to French per Eric's language policy directive. `proposal-cicd-optimization.md`
was already in French — skipped. Translation preserves English in code blocks and identifiers.

### 2026-05-19 — SMS Feature Backlog Created

**Issues created:** #88, #89, #90, #91, #92, #93, #94 (7 total)  
**Scope:** SMS notifications via Azure Communication Services (ACS). Parse employee Excel data, send SMS to selected offices, HTML form interface.  
**Budget impact:** ~38 hours allocated (leaves 87 hours for other work within 125-hour budget)  
**Squad allocation:** Dozer (infra), Neo (features), Mouse (SMS client), Oracle (docs)  
**Structure:** Layered by dependency—infrastructure first, then features, then docs  
**Key decision:** Keep it simple (MVP)—no complex frameworks, vanilla JS form, inline HTML

### 2026-05-19 — SMS Feature Documentation (Issue #94)

**Deliverable:** PR #99 (draft)

**Documentation structure:**
- Updated README.md with SMS feature section (3 bullet points describing ACS notifications)
- Created docs/sms-feature.md (13.8 KB comprehensive guide) with:
  - Architecture diagram (text-based flowchart + data flow)
  - API endpoint contracts (GET /api/notifications/sms/form, POST /api/notifications/sms/send-by-bureau)
  - ACS configuration: Bicep modules, Key Vault secrets (acs-connection-string, acs-phone-number), App Config (Acs:ConnectionString, Acs:PhoneNumber)
  - Deployment guide: post-deployment phone number acquisition workflow (Azure Portal → Key Vault)
  - Testing guide: mock patterns (Moq setup) + integration tests with Azurite
  - CASL compliance notes (consent, opt-out, audit trail)
  - Troubleshooting table (6 common issues)
- Updated docs/README.md table of contents to include SMS feature doc

**Key findings:**
- ACS module already exists in infra/modules/acsService.bicep (deployed by main.bicep)
- Phone number must be manually acquired post-deployment (ACS Portal limitation—no Bicep support)
- SMS endpoints (#92, #93) documented as "coming soon" with intended contract based on issue descriptions
- Architecture integrates ACS alongside existing Nethris sync pipeline (no architectural conflicts)

**Lessons:**
- Documentation-first approach validates API contracts before implementation begins
- Flowchart + prose combination (not pure Mermaid) works better for complex integration diagrams
- Deployment guides must cover manual steps (phone number acquisition) separately from Bicep provisioning

### 2026-05-20 — ACS Phone Number Acquisition Guide (Eric De Carufel request)

**Deliverable:** `docs/guide-acquisition-numero-acs.md` — Comprehensive French guide for acquiring a toll-free SMS number in Azure Communication Services

**Documentation structure:**
- Complete pre-requisites checklist (Azure subscription, ACS resource, prepared documents)
- Phone number type comparison (why toll-free is mandatory for SMS in Canada)
- Step-by-step portal acquisition workflow (5 minutes to **Unverified** status)
- Toll-free verification form submission (mandatory since Nov 8, 2023; 1–15 day timeline)
- Regulatory compliance section covering:
  - **CASL** (exemption for emergency SMS to employees; opt-out handling required)
  - **Loi 25** (Quebec privacy law; EFVP mandatory before production deployment)
  - **CRTC** (carrier regulations; STOP/ARRET keyword handling)
- Technical configuration post-verification (Key Vault storage, Event Grid webhooks)
- 7-week action plan (from acquisition through production go-live with compliance checkpoints)
- FAQ and troubleshooting for common errors and status interpretations
- Pricing table ($2.00 CAD/month + $0.0085 CAD/SMS segment)

**Updates to collateral:**
- Updated `docs/index.md` — added link to new guide in both quick navigation and "Développement" section
- Updated `zensical.toml` — added new page to nav under "Exploitation & Conformité"
- Updated `docs/index.md` stack description — replaced "Twilio SMS" with "Azure Communication Services (ACS) SMS"

**Key research integrated:**
- All findings from `.squad/decisions.md` decision #39–40 (ACS phone number research by Dozer + Mouse)
- Timeline, pricing, verification workflow sourced from Microsoft documentation
- Quebec-specific requirements (Loi 25, EFVP) documented with compliance checkpoints
- Manual STOP/ARRET keyword handling (ACS limitation vs Twilio native support) highlighted

**Lessons:**
- Cross-referencing related docs (sms-compliance.md, guide-sms-api.md) keeps maintenance centralized
- Task lists + timeline table combo helps operators understand both what and when
- Regulatory compliance sections must be jurisdictionally specific (Canada/Quebec context paramount)
- Admonitions (warning, note, tip) effectively highlight critical vs optional steps

### 2026-05-20 — EntraID SMS Auth Issues Created
**Issues created:** #126, #127, #128, #129, #130 (5 total)
**Scope:** Secure SMS endpoints with Microsoft Entra ID authentication and group-based authorization.
**Budget impact:** ~24 hours estimated
**Squad allocation:** Neo (auth middleware + group auth + confirmation UX), Dozer (Bicep infra), Oracle (docs)
**Structure:** #126 + #128 + #129 parallel → #127 depends on #126 → #130 depends on #126, #127, #128
**Key decision:** SMS confirmation dialog includes temporary note about SMS not being functional yet

### 2026-05-25 — SMS Dialog UI Refinement Estimation (Issue #137)

**Deliverable:** GitHub comment #137 with acceptance criteria + effort breakdown

**Scope:** Refine SMS form dialog — single-column layout, collapsible bureaus with expand/collapse icons, inline employee list with phone numbers.

**Acceptance Criteria (5 AC in Gherkin, French):**
1. Single-column checkbox layout renders correctly on mobile + desktop
2. Collapse/expand toggle on bureau header — click → expands, click again → collapses, chevron rotates
3. Employee list shows name + formatted phone (e.g., +1 418 555-0123) when bureau opens; employees ordered alphabetically
4. Empty bureau case — message "Aucun employé éligible pour SMS" shown if no eligible employees
5. Checkbox selection + collapse/expand are independent actions (clicking checkbox does NOT auto-collapse panel)

**Effort Breakdown (15h total):**
- CSS/Layout: 3h (single-column, collapse/expand styles, chevron icons, animations)
- C# data model: 2h (new EmployeePreviewRecord, grouping by bureau)
- C# phone formatter: 1h (E164 → readable format)
- HTML template: 2h (collapsible header, employee list, empty state)
- JavaScript toggle handler: 2h (click listener, active class, smooth animation)
- SpecFlow tests: 3h (4–5 BDD scenarios covering all AC)
- C# unit tests: 1h (formatter, grouping logic)
- Integration + polish: 1h (edge cases, mobile rendering, keyboard a11y)
- **Total: 15h** — purely UI/JS, no API or infra changes

**Key Risks:**
- HTML size if many bureaus × many employees (50+ bureaus × 20 employees × ~100 bytes/line ≈ 100+ KB) → mitigate with lazy-load if observed
- Keyboard accessibility (Tab/Enter on collapse/expand) → add `role="button"`, `tabindex="0"`, `onkeydown` handler
- Mobile rendering on very small screens (320px) → responsive padding/font
- Event listener performance → use event delegation (single parent listener, not per-row)
- All employees injected at once (no lazy-load for MVP) → acceptable for iteration; optimize later

**Lessons — UI-Only Feature Estimation:**
- UI-only changes (no API, no infra) typically 60–70% smaller than backend work
- Gherkin AC directly translates to test scenarios (SpecFlow) — write AC before implementation
- CSS + JS breakdown: animations + event listeners = 4h combined (not just 1h)
- Always account for formatter/utility functions (phone, date, enum) separately — often underestimated
- Mobile-first CSS reduces refactor risk mid-implementation
- Empty/edge cases (no eligible employees, many bureaus) critical to scope upfront

**Comment posted:** https://github.com/equipe-laurence/integration-nethris/issues/137#issuecomment-4537813962

