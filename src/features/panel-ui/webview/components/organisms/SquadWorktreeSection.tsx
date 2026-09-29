import { useEffect, useMemo, useState } from "preact/hooks";
import { useSquadWorktrees } from "../../hooks/useSquadWorktrees";
import {
  SquadBacklogItem,
  SquadWorktreeCleanupCandidate,
  SquadWorktreeCleanupReason,
  SquadWorktreeCreateRequest,
  SquadWorktreeDependencyMode,
  SquadWorktreeDependencyState,
  SquadWorktreeInfo,
} from "../../../../squad/models";

const DEPENDENCY_OPTIONS: SquadWorktreeDependencyMode[] = [
  SquadWorktreeDependencyMode.Auto,
  SquadWorktreeDependencyMode.Install,
  SquadWorktreeDependencyMode.Link,
  SquadWorktreeDependencyMode.None,
];

const DEPENDENCY_LABEL: Record<SquadWorktreeDependencyMode, string> = {
  [SquadWorktreeDependencyMode.Auto]: "Auto",
  [SquadWorktreeDependencyMode.Install]: "Install",
  [SquadWorktreeDependencyMode.Link]: "Link",
  [SquadWorktreeDependencyMode.None]: "None",
};

const DEPENDENCY_STATE_LABEL: Record<SquadWorktreeDependencyState, string> = {
  [SquadWorktreeDependencyState.Installed]: "installed",
  [SquadWorktreeDependencyState.Linked]: "linked",
  [SquadWorktreeDependencyState.Skipped]: "skipped",
  [SquadWorktreeDependencyState.Failed]: "failed",
  [SquadWorktreeDependencyState.Unknown]: "unknown",
};

const CLEANUP_REASON_LABEL: Record<SquadWorktreeCleanupReason, string> = {
  [SquadWorktreeCleanupReason.PullRequestMerged]: "PR merged",
  [SquadWorktreeCleanupReason.MergedIntoBase]: "Merged into base",
  [SquadWorktreeCleanupReason.UpstreamGone]: "Upstream gone",
  [SquadWorktreeCleanupReason.ItemClosed]: "Item closed",
  [SquadWorktreeCleanupReason.Prunable]: "Prunable",
};

export function SquadWorktreeSection() {
  const {
    items,
    worktrees,
    pending,
    preview,
    lastOutcome,
    cleanupCandidates,
    lastCleanup,
    lastDependencyRetry,
    listBacklogItems,
    listWorktrees,
    previewCreate,
    createWorktree,
    openWorktree,
    findCleanupCandidates,
    cleanupWorktree,
    retryDependencies,
  } = useSquadWorktrees();
  const [selectedItemId, setSelectedItemId] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [dependencies, setDependencies] = useState<SquadWorktreeDependencyMode>(SquadWorktreeDependencyMode.Auto);
  const [openInNewWindow, setOpenInNewWindow] = useState(true);
  const [cleanupWorktreeId, setCleanupWorktreeId] = useState("");
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [discardChanges, setDiscardChanges] = useState(false);

  useEffect(() => {
    listBacklogItems({ squadOnly: true, limit: 50 });
    listWorktrees();
  }, []);

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedItemId) ?? null, [items, selectedItemId]);
  const activePreview = preview && preview.itemId === selectedItemId ? preview : null;
  const cleanupCandidate = useMemo(
    () => cleanupCandidates.find((candidate) => candidate.worktree.id === cleanupWorktreeId) ?? null,
    [cleanupCandidates, cleanupWorktreeId]
  );
  const request = selectedItem ? createRequest(selectedItem, baseBranch, dependencies, openInNewWindow) : null;
  const busy = pending !== null;
  const partialFailure = lastOutcome?.dependencies.error ?? null;
  const retrySuccess =
    lastDependencyRetry?.outcome.state && lastDependencyRetry.outcome.state !== SquadWorktreeDependencyState.Failed;

  return (
    <div class="squad-worktrees">
      <div class="squad-worktree-toolbar">
        <button
          class="squad-worktree-button secondary"
          onClick={() => listBacklogItems({ squadOnly: true, limit: 50 })}
          disabled={busy}
        >
          <i class="codicon codicon-refresh" aria-hidden="true"></i> Refresh items
        </button>
        <button class="squad-worktree-button secondary" onClick={listWorktrees} disabled={busy}>
          <i class="codicon codicon-list-tree" aria-hidden="true"></i> Refresh worktrees
        </button>
      </div>

      <div class="squad-worktree-create">
        <h3>Start work on an item</h3>
        <label class="squad-worktree-field">
          <span>Backlog item</span>
          <select
            value={selectedItemId}
            disabled={busy}
            aria-label="Squad backlog item"
            onInput={(event) => setSelectedItemId((event.target as HTMLSelectElement).value)}
          >
            <option value="">Choose an open Squad item…</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                #{item.number} {item.title}
              </option>
            ))}
          </select>
        </label>

        <div class="squad-worktree-options">
          <label class="squad-worktree-field">
            <span>Base branch</span>
            <input
              type="text"
              value={baseBranch}
              placeholder="Auto-detect"
              disabled={busy}
              onInput={(event) => setBaseBranch((event.target as HTMLInputElement).value)}
            />
          </label>
          <label class="squad-worktree-field">
            <span>Dependencies</span>
            <select
              value={dependencies}
              disabled={busy}
              onInput={(event) => setDependencies((event.target as HTMLSelectElement).value as SquadWorktreeDependencyMode)}
            >
              {DEPENDENCY_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>
                  {DEPENDENCY_LABEL[mode]}
                </option>
              ))}
            </select>
          </label>
          <label class="squad-worktree-checkbox">
            <input
              type="checkbox"
              checked={openInNewWindow}
              disabled={busy}
              onInput={(event) => setOpenInNewWindow((event.target as HTMLInputElement).checked)}
            />
            <span>Open in new window</span>
          </label>
        </div>

        <div class="squad-worktree-actions">
          <button class="squad-worktree-button" disabled={!request || busy} onClick={() => request && previewCreate(request)}>
            Preview
          </button>
          <button
            class="squad-worktree-button primary"
            disabled={!request || busy}
            onClick={() => request && createWorktree(request)}
          >
            Create worktree
          </button>
        </div>

        {pending === "preview" && <p class="loading">Preparing worktree preview…</p>}
        {activePreview && <WorktreePreview preview={activePreview} />}
        {partialFailure && lastOutcome && (
          <div class="squad-worktree-warning" role="status">
            <strong>Worktree created, but dependencies failed.</strong>
            <p>{partialFailure.message}</p>
            {partialFailure.remediation && <p>{partialFailure.remediation}</p>}
            <button
              class="squad-worktree-button"
              disabled={busy}
              onClick={() => retryDependencies(lastOutcome.worktree.id, lastOutcome.dependencies.mode)}
            >
              Retry dependencies
            </button>
          </div>
        )}
        {retrySuccess && (
          <p class="squad-worktree-success">Dependencies retried: {DEPENDENCY_STATE_LABEL[lastDependencyRetry.outcome.state]}.</p>
        )}
      </div>

      <div class="squad-worktree-list-block">
        <h3>Existing worktrees</h3>
        <WorktreeList
          worktrees={worktrees}
          busy={busy}
          onOpen={(id) => openWorktree(id, true)}
          onClean={(id) => setCleanupWorktreeId(id)}
        />
      </div>

      <div class="squad-worktree-cleanup">
        <div class="squad-worktree-cleanup-head">
          <h3>Cleanup candidates</h3>
          <button class="squad-worktree-button secondary" onClick={findCleanupCandidates} disabled={busy}>
            Find worktrees to clean up
          </button>
        </div>
        {lastCleanup && (
          <p class="squad-worktree-success">
            Cleanup {lastCleanup.outcome.removed ? "completed" : "did not remove the worktree"}.
          </p>
        )}
        <CleanupCandidateList
          candidates={cleanupCandidates}
          selectedId={cleanupWorktreeId}
          onSelect={(id) => {
            setCleanupWorktreeId(id);
            setDiscardChanges(false);
          }}
        />
        {cleanupCandidate && (
          <CleanupConfirm
            candidate={cleanupCandidate}
            deleteBranch={deleteBranch}
            discardChanges={discardChanges}
            busy={busy}
            onDeleteBranchChange={setDeleteBranch}
            onDiscardChange={setDiscardChanges}
            onCancel={() => setCleanupWorktreeId("")}
            onConfirm={() =>
              cleanupWorktree({
                worktreeId: cleanupCandidate.worktree.id,
                deleteBranch,
                discardChanges,
              })
            }
          />
        )}
      </div>
    </div>
  );
}

function createRequest(
  item: SquadBacklogItem,
  baseBranch: string,
  dependencies: SquadWorktreeDependencyMode,
  openInNewWindow: boolean
): SquadWorktreeCreateRequest {
  return {
    providerId: item.providerId,
    itemId: item.id,
    baseBranch: baseBranch.trim() || undefined,
    dependencies,
    openInNewWindow,
  };
}

function WorktreePreview({ preview }: { preview: NonNullable<ReturnType<typeof useSquadWorktrees>["preview"]> }) {
  return (
    <div class="squad-worktree-preview" aria-label="Worktree preview">
      <div>
        <span>Branch</span>
        <code>{preview.branch}</code>
      </div>
      <div>
        <span>Folder</span>
        <code>{preview.displayPath}</code>
      </div>
      <div>
        <span>Base</span>
        <code>{preview.baseBranch}</code>
      </div>
      {preview.warnings.map((warning) => (
        <p key={warning.code} class="squad-worktree-warning-line">
          <i class="codicon codicon-warning" aria-hidden="true"></i> {warning.message}
        </p>
      ))}
    </div>
  );
}

function WorktreeList({
  worktrees,
  busy,
  onOpen,
  onClean,
}: {
  worktrees: SquadWorktreeInfo[];
  busy: boolean;
  onOpen: (id: string) => void;
  onClean: (id: string) => void;
}) {
  if (worktrees.length === 0) {
    return <p class="empty-message">No Squad worktrees detected yet.</p>;
  }

  return (
    <ul class="squad-worktree-list">
      {worktrees.map((worktree) => (
        <li key={worktree.id} class="squad-worktree-card">
          <div class="squad-worktree-card-main">
            <strong>{worktree.branch ?? "Detached worktree"}</strong>
            <span>{worktree.displayPath}</span>
            <div class="squad-worktree-meta">
              <span>Issue {worktree.issueNumber === null ? "unknown" : `#${worktree.issueNumber}`}</span>
              <span>{worktree.dirty === null ? "unknown status" : worktree.dirty ? "dirty" : "clean"}</span>
              <span>deps {DEPENDENCY_STATE_LABEL[worktree.dependencies]}</span>
              {worktree.ahead !== null && <span>ahead {worktree.ahead}</span>}
              {worktree.behind !== null && <span>behind {worktree.behind}</span>}
            </div>
          </div>
          <div class="squad-worktree-card-actions">
            <button class="squad-worktree-button secondary" disabled={busy} onClick={() => onOpen(worktree.id)}>
              Open
            </button>
            <button
              class="squad-worktree-button secondary"
              disabled={busy || worktree.isMain}
              onClick={() => onClean(worktree.id)}
            >
              Clean up
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CleanupCandidateList({
  candidates,
  selectedId,
  onSelect,
}: {
  candidates: SquadWorktreeCleanupCandidate[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (candidates.length === 0) {
    return <p class="empty-message">No cleanup candidates loaded.</p>;
  }

  return (
    <ul class="squad-worktree-candidates">
      {candidates.map((candidate) => (
        <li key={candidate.worktree.id}>
          <button
            class={`squad-worktree-candidate${selectedId === candidate.worktree.id ? " selected" : ""}`}
            onClick={() => onSelect(candidate.worktree.id)}
          >
            <strong>{candidate.worktree.branch ?? candidate.worktree.id}</strong>
            <span>{formatReasons(candidate)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CleanupConfirm({
  candidate,
  deleteBranch,
  discardChanges,
  busy,
  onDeleteBranchChange,
  onDiscardChange,
  onCancel,
  onConfirm,
}: {
  candidate: SquadWorktreeCleanupCandidate;
  deleteBranch: boolean;
  discardChanges: boolean;
  busy: boolean;
  onDeleteBranchChange: (value: boolean) => void;
  onDiscardChange: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const hardBlocker = candidate.blockers.includes("current-window") || candidate.blockers.includes("locked");
  const needsDiscard = candidate.blockers.includes("dirty") || candidate.blockers.includes("unpushed");
  const disabled = busy || hardBlocker || (needsDiscard && !discardChanges);

  return (
    <div class="squad-worktree-confirm" role="group" aria-label="Confirm worktree cleanup">
      <h4>Confirm cleanup</h4>
      <p>
        {candidate.worktree.branch ?? candidate.worktree.id} · {candidate.worktree.displayPath}
      </p>
      <p>
        Reasons:{" "}
        {candidate.reasons.length ? candidate.reasons.map((reason) => CLEANUP_REASON_LABEL[reason]).join(", ") : "manual cleanup"}
      </p>
      {candidate.blockers.length > 0 && <p>Blockers: {candidate.blockers.join(", ")}</p>}
      <label class="squad-worktree-checkbox">
        <input
          type="checkbox"
          checked={deleteBranch}
          disabled={busy}
          onInput={(event) => onDeleteBranchChange((event.target as HTMLInputElement).checked)}
        />
        <span>Delete local branch when safe</span>
      </label>
      {needsDiscard && (
        <label class="squad-worktree-checkbox">
          <input
            type="checkbox"
            checked={discardChanges}
            disabled={busy}
            onInput={(event) => onDiscardChange((event.target as HTMLInputElement).checked)}
          />
          <span>Confirm stash/discard for dirty or unpushed work</span>
        </label>
      )}
      <div class="squad-worktree-actions">
        <button class="squad-worktree-button secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button class="squad-worktree-button danger" disabled={disabled} onClick={onConfirm}>
          Clean up worktree
        </button>
      </div>
    </div>
  );
}

function formatReasons(candidate: SquadWorktreeCleanupCandidate): string {
  const reasons = candidate.reasons.map((reason) => CLEANUP_REASON_LABEL[reason]);
  return [...reasons, ...candidate.blockers].join(", ") || "Manual cleanup";
}
