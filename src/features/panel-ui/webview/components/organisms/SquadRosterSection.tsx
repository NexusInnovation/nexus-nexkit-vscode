import { useState } from "preact/hooks";
import { useSquadState } from "../../hooks/useSquadState";
import { SkeletonList } from "../atoms/Skeleton";
import { SquadErrorNotice } from "../molecules/SquadErrorNotice";
import { SquadMarkdownView } from "../molecules/SquadMarkdownView";

/**
 * SquadRosterSection Component (SQD-012, FR-022)
 *
 * Read-only, purely presentational view of the Squad roster read from
 * `.squad/team.md` and the agent charters read from
 * `.squad/agents/<id>/charter.md`. Renders a roster table; selecting a member
 * that has a charter reveals its content below.
 *
 * State is sourced entirely from the Squad AppState slice via
 * {@link useSquadState}; all loading, empty and error states are shown
 * explicitly so failures never appear as a silent success.
 */
export function SquadRosterSection() {
  const { isReady, isLoading, error, roster, charters } = useSquadState();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const selectedCharter = selectedAgentId ? (charters.find((charter) => charter.agentId === selectedAgentId) ?? null) : null;

  const toggleAgent = (agentId: string, hasCharter: boolean) => {
    if (!hasCharter) {
      return;
    }
    setSelectedAgentId((current) => (current === agentId ? null : agentId));
  };

  return (
    <div class="squad-roster">
      {error && <SquadErrorNotice error={error} />}

      {!isReady && !error && <SkeletonList label="Loading roster" rows={4} />}

      {isReady && isLoading && <p class="loading">Refreshing roster…</p>}

      {isReady && !error && roster.length === 0 && (
        <p class="empty-message">
          No Squad members found. Ensure <code>.squad/team.md</code> exists and lists members.
        </p>
      )}

      {isReady && roster.length > 0 && (
        <table class="squad-roster-table">
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Role</th>
              <th scope="col">Charter</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((member) => {
              const isSelected = member.id === selectedAgentId;
              return (
                <tr
                  key={member.id}
                  class={`squad-roster-row${member.hasCharter ? " has-charter" : ""}${isSelected ? " selected" : ""}`}
                  onClick={() => toggleAgent(member.id, member.hasCharter)}
                  title={member.hasCharter ? "Show charter" : "No charter available"}
                >
                  <td>
                    <div class="squad-member-name">{member.name}</div>
                    {member.summary && <div class="squad-member-summary">{member.summary}</div>}
                  </td>
                  <td>{member.role ?? "—"}</td>
                  <td>
                    {member.hasCharter ? (
                      <i
                        class={`codicon ${isSelected ? "codicon-chevron-down" : "codicon-book"}`}
                        aria-label={isSelected ? "Hide charter" : "Show charter"}
                      ></i>
                    ) : (
                      <span class="squad-no-charter">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {selectedCharter && (
        <div class="squad-charter-detail">
          <h3 class="squad-charter-title">
            <i class="codicon codicon-book" aria-hidden="true"></i> {selectedCharter.agentId} charter
          </h3>
          <SquadMarkdownView content={selectedCharter.content} ariaLabel={`${selectedCharter.agentId} charter`} emptyMessage="This charter is empty." />
        </div>
      )}
    </div>
  );
}
