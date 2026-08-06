# Session Log — 2026-08-06 — Branch prefix mapping

**Requested by:** Eric Decarufel
**Agents:** Link (background)

Link updated `branchNameBuilder.ts` to map Azure DevOps work item types to industry-standard branch prefixes
(`bugfix/`, `feature/`, `chore/`, `experiment/`, `test/`, `docs/`) instead of always slugifying the raw type.
Lookup is case-insensitive with fallback to the old slugify behavior for unmapped/custom types. Updated
`branchNameBuilder.test.ts` and `devOpsBranchCreationService.test.ts`. `npm run check:types` clean, `npm test` →
440 passing, 8 pending, exit code 0.

Decision recorded in `decisions.md`. Inbox file merged and cleared.
