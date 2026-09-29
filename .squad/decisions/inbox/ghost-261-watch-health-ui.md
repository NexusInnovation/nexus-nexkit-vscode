# Decision Inbox: SQD-046 watch health UI

**Owner:** Ghost  
**Issue:** #261 — SQD-046: Afficher santé et logs de squad watch  
**Date:** 2026-09-29

## Decision

The Preact panel consumes Link's SQD-045 `SquadWatchSnapshot` contract through the existing `SquadState.watch` field and `useSquadState` actions. The detected Squad tab now mounts a `Watch health & logs` collapsible section that requests `getSquadWatchStatus` on mount, renders lifecycle health, process metadata, dropped-line counts, and the retained log stream, and sends `startSquadWatch` / `stopSquadWatch` only through hook actions.

## Notes

- The component keeps only transient interval input in local state; all durable watch state remains in AppState.
- Failed watch snapshots render `SquadErrorNotice` from `status.error`, so failed health cannot appear as a successful/empty log state.
- Happy-dom coverage lives in `test/suite/webview/squadWatchSection.test.tsx`; run `node .\out\test\runWebviewTest.js` after `npm run test-compile` to execute it.
