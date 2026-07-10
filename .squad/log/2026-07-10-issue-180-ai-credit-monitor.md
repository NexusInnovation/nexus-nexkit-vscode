# Session Log: Issue #180 AI Credit Monitor

**Date:** 2026-07-10
**Requestor:** Eric De Carufel

## Summary

Link researched the existing `nexus-copilot-report` authentication and usage flow and proposed the extension integration design. Morpheus refined the architecture around a separate authenticated Function App, identity-derived login, security boundaries, and measurable acceptance criteria.

Eric clarified and approved the product KPI: display total monetary consumption split between included and additional credits using USD 0.01 per AI credit, without a budget cap or percentage. The Coordinator published and verified the clarification in two issue #180 comments. No source files, issue metadata, labels, or state were changed.

## Refinement Update

Eric approved the local-only V1 design: no Azure Function or hosted backend. NexKit uses the active VS Code GitHub session to resolve the target identity, and a locally supplied billing credential stored only in `ExtensionContext.secrets` / VS Code SecretStorage for billing calls for that login.

V1 excludes organization, peer, budget, and percentage data. Its KPI is own included credits, additional credits, and total USD at USD 0.01 per AI credit, pending POC validation that GitHub response semantics can be combined without double counting. Because VS Code has no public cross-extension Copilot Chat usage event, refresh is limited to at most once per focused minute and lifecycle, identity/configuration, or manual triggers; attribution may lag.

Eric approved the refinement and correction comments were posted at:

- https://github.com/NexusInnovation/nexus-nexkit-vscode/issues/180#issuecomment-4939569108
- https://github.com/NexusInnovation/nexus-nexkit-vscode/issues/180#issuecomment-4939569111

No source code, issue body, labels, or state changed.

Three existing RTF preview decision inbox entries were processed as duplicates of decisions already present in the canonical ledger and removed without re-appending them.
