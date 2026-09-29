import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { useSquadPlugins } from "../../hooks/useSquadPlugins";
import { SkeletonList } from "../atoms/Skeleton";
import { SquadErrorNotice } from "../molecules/SquadErrorNotice";
import { SquadOperationFeedbackView } from "../molecules/SquadOperationFeedback";
import {
  NEXUS_SQUAD_MARKETPLACE_REPO,
  SQUAD_PLUGIN_ACTIONS,
  SquadMarketplaceKind,
  SquadMarketplaceRef,
  SquadPluginAction,
  SquadPluginRef,
  SquadPluginStatus,
} from "../../../../squad/models";
import { PLUGIN_STATUS_LABEL, pluginStatus } from "../../utils/squadPluginFormat";

/** Human-readable labels for marketplace source kinds (FR-042). */
const MARKETPLACE_KIND_LABEL: Record<SquadMarketplaceKind, string> = {
  [SquadMarketplaceKind.GitHub]: "GitHub",
  [SquadMarketplaceKind.Local]: "Local",
  [SquadMarketplaceKind.Url]: "URL",
  [SquadMarketplaceKind.Unknown]: "Unknown",
};

/** Tooltip for an action button: write actions announce the host confirmation (FR-044). */
export function pluginActionTitle(action: SquadPluginAction, target?: string): string {
  const descriptor = SQUAD_PLUGIN_ACTIONS[action];
  const subject = target ? ` "${target}"` : "";
  const suffix = descriptor.writes ? " (asks for confirmation and backs up .squad/ first)" : " (read-only)";
  return `${descriptor.label}${subject}${suffix}`;
}

interface PluginActionButtonProps {
  action: SquadPluginAction;
  target?: string;
  icon: string;
  disabled: boolean;
  onRun: (action: SquadPluginAction, target?: string) => void;
  children: ComponentChildren;
  /** Accessible label; defaults to the tooltip. */
  ariaLabel?: string;
}

function PluginActionButton({ action, target, icon, disabled, onRun, children, ariaLabel }: PluginActionButtonProps) {
  const descriptor = SQUAD_PLUGIN_ACTIONS[action];
  const title = pluginActionTitle(action, target);
  return (
    <button
      class={`squad-plugin-action${descriptor.destructive ? " squad-danger" : ""}`}
      data-action={action}
      onClick={() => onRun(action, target)}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel ?? title}
    >
      <i class={`codicon codicon-${icon}`} aria-hidden="true"></i>
      {children}
    </button>
  );
}

interface SquadMarketplaceListProps {
  marketplaces: SquadMarketplaceRef[];
  disabled: boolean;
  onRun: (action: SquadPluginAction, target?: string) => void;
}

/** Marketplaces read from `.squad/plugins/marketplaces.json` (FR-042). */
export function SquadMarketplaceList({ marketplaces, disabled, onRun }: SquadMarketplaceListProps) {
  if (marketplaces.length === 0) {
    return (
      <p class="empty-message">
        No marketplaces registered in <code>.squad/plugins/marketplaces.json</code>.
      </p>
    );
  }

  return (
    <table class="squad-plugin-table squad-marketplace-table">
      <thead>
        <tr>
          <th scope="col">Marketplace</th>
          <th scope="col">Source</th>
          <th scope="col">State</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {marketplaces.map((marketplace) => (
          <tr key={marketplace.id} data-marketplace={marketplace.id}>
            <td class="squad-plugin-name">{marketplace.displayName ?? marketplace.id}</td>
            <td>
              <span class={`squad-upstream-kind squad-marketplace-kind-${marketplace.kind}`}>
                {MARKETPLACE_KIND_LABEL[marketplace.kind]}
              </span>{" "}
              <code class="squad-upstream-reference">{marketplace.source}</code>
              {marketplace.ref && <span class="squad-upstream-git-ref"> @ {marketplace.ref}</span>}
            </td>
            <td>
              <span class={`squad-plugin-status squad-plugin-status-${marketplace.enabled ? "enabled" : "disabled"}`}>
                {marketplace.enabled ? "Enabled" : "Disabled"}
              </span>
            </td>
            <td class="squad-plugin-actions">
              <PluginActionButton
                action={SquadPluginAction.RemoveMarketplace}
                target={marketplace.id}
                icon="trash"
                disabled={disabled}
                onRun={onRun}
              >
                <span class="squad-plugin-action-text"> Remove</span>
              </PluginActionButton>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface SquadInstalledPluginListProps {
  plugins: SquadPluginRef[];
  disabled: boolean;
  onRun: (action: SquadPluginAction, target?: string) => void;
}

/** Installed plugins from `squad plugin list --json` (FR-043) with lifecycle actions (FR-044). */
export function SquadInstalledPluginList({ plugins, disabled, onRun }: SquadInstalledPluginListProps) {
  if (plugins.length === 0) {
    return <p class="empty-message">No Squad plugins installed.</p>;
  }

  return (
    <table class="squad-plugin-table squad-installed-plugin-table">
      <thead>
        <tr>
          <th scope="col">Plugin</th>
          <th scope="col">Status</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {plugins.map((plugin) => {
          const status = pluginStatus(plugin);
          return (
            <tr key={plugin.id} data-plugin={plugin.id}>
              <td>
                <span class="squad-plugin-name">{plugin.displayName ?? plugin.id}</span>
                {plugin.version && <span class="squad-plugin-version"> v{plugin.version}</span>}
                {plugin.marketplace && <div class="squad-plugin-meta">from {plugin.marketplace}</div>}
                {plugin.description && <div class="squad-plugin-meta">{plugin.description}</div>}
              </td>
              <td>
                <span class={`squad-plugin-status squad-plugin-status-${status}`}>{PLUGIN_STATUS_LABEL[status]}</span>
              </td>
              <td class="squad-plugin-actions">
                {status === SquadPluginStatus.Enabled ? (
                  <PluginActionButton
                    action={SquadPluginAction.Disable}
                    target={plugin.id}
                    icon="debug-pause"
                    disabled={disabled}
                    onRun={onRun}
                  >
                    <span class="squad-plugin-action-text"> Disable</span>
                  </PluginActionButton>
                ) : (
                  <PluginActionButton
                    action={SquadPluginAction.Enable}
                    target={plugin.id}
                    icon="play"
                    disabled={disabled}
                    onRun={onRun}
                  >
                    <span class="squad-plugin-action-text"> Enable</span>
                  </PluginActionButton>
                )}
                <PluginActionButton
                  action={SquadPluginAction.Refresh}
                  target={plugin.id}
                  icon="refresh"
                  disabled={disabled}
                  onRun={onRun}
                >
                  <span class="squad-plugin-action-text"> Refresh</span>
                </PluginActionButton>
                <PluginActionButton
                  action={SquadPluginAction.Uninstall}
                  target={plugin.id}
                  icon="trash"
                  disabled={disabled}
                  onRun={onRun}
                >
                  <span class="squad-plugin-action-text"> Uninstall</span>
                </PluginActionButton>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * SquadPluginsSection Component (SQD-040, FR-042/FR-043/FR-044)
 *
 * Shows the registered marketplaces and installed plugins, and launches
 * marketplace registration plus validate / dry-run / install / enable /
 * disable / uninstall / refresh through the Squad CLI. The host confirms and
 * backs up before every write, and prompts for a missing marketplace source or
 * plugin folder. Failures render as actionable alerts and never as success.
 * Purely presentational: state and actions come from {@link useSquadPlugins};
 * the inputs only hold transient form text.
 */
export function SquadPluginsSection() {
  const {
    isReady,
    isBusy,
    marketplaces,
    plugins,
    nexusMarketplaceRegistered,
    lastAction,
    feedback,
    inventoryError,
    refreshPlugins,
    runPluginAction,
    retryLastAction,
  } = useSquadPlugins();
  const [marketplaceSource, setMarketplaceSource] = useState("");
  const [pluginFolder, setPluginFolder] = useState("");

  if (!isReady) {
    return inventoryError ? (
      <div class="squad-plugins">
        <SquadErrorNotice error={inventoryError} />
      </div>
    ) : (
      <div class="squad-plugins">
        <SkeletonList label="Loading Squad plugins" rows={3} />
      </div>
    );
  }

  const output = lastAction?.ok && lastAction.output?.trim() ? lastAction.output : null;

  return (
    <div class="squad-plugins">
      {inventoryError && <SquadErrorNotice error={inventoryError} />}

      <div class="squad-toolbar">
        <button
          class="squad-toolbar-button"
          onClick={refreshPlugins}
          disabled={isBusy}
          title="Re-read marketplaces and installed plugins"
        >
          <i class={`codicon codicon-refresh${isBusy ? " codicon-modifier-spin" : ""}`} aria-hidden="true"></i> Refresh plugins
        </button>
      </div>

      <p class="squad-plugins-hint">
        <i class="codicon codicon-shield" aria-hidden="true"></i> Write actions ask for confirmation and back up{" "}
        <code>.squad/</code> before running. Validate and dry-run never change anything.
      </p>

      {feedback && <SquadOperationFeedbackView feedback={feedback} onRetry={retryLastAction} disabled={isBusy} />}
      {output && <pre class="squad-plugin-action-output">{output}</pre>}

      <h4 class="squad-subsection-title">Marketplaces</h4>
      <SquadMarketplaceList marketplaces={marketplaces} disabled={isBusy} onRun={runPluginAction} />

      {!nexusMarketplaceRegistered && (
        <div class="squad-plugin-row">
          <PluginActionButton action={SquadPluginAction.AddNexusMarketplace} icon="add" disabled={isBusy} onRun={runPluginAction}>
            {" "}
            Register the Nexus marketplace
          </PluginActionButton>
          <span class="squad-plugin-meta">
            <code>{NEXUS_SQUAD_MARKETPLACE_REPO}</code>
          </span>
        </div>
      )}

      <div class="squad-plugin-row">
        <input
          class="squad-marketplace-source-input"
          type="text"
          value={marketplaceSource}
          placeholder="owner/repo (leave empty to be prompted)"
          aria-label="Marketplace repository"
          disabled={isBusy}
          onInput={(event) => setMarketplaceSource((event.target as HTMLInputElement).value)}
        />
        <PluginActionButton
          action={SquadPluginAction.AddMarketplace}
          target={marketplaceSource.trim() || undefined}
          icon="add"
          disabled={isBusy}
          onRun={runPluginAction}
          ariaLabel="Register marketplace"
        >
          {" "}
          Register
        </PluginActionButton>
      </div>

      <h4 class="squad-subsection-title">Installed plugins</h4>
      <SquadInstalledPluginList plugins={plugins} disabled={isBusy} onRun={runPluginAction} />

      <h4 class="squad-subsection-title">Local plugin folder</h4>
      <div class="squad-plugin-row">
        <input
          class="squad-plugin-folder-input"
          type="text"
          value={pluginFolder}
          placeholder="Plugin folder (leave empty to browse)"
          aria-label="Local plugin folder"
          disabled={isBusy}
          onInput={(event) => setPluginFolder((event.target as HTMLInputElement).value)}
        />
      </div>
      <div class="squad-plugin-row">
        {[
          { action: SquadPluginAction.Validate, icon: "checklist", text: "Validate" },
          { action: SquadPluginAction.DryRun, icon: "eye", text: "Dry-run" },
          { action: SquadPluginAction.Install, icon: "cloud-download", text: "Install" },
        ].map(({ action, icon, text }) => (
          <PluginActionButton
            key={action}
            action={action}
            target={pluginFolder.trim() || undefined}
            icon={icon}
            disabled={isBusy}
            onRun={runPluginAction}
            ariaLabel={SQUAD_PLUGIN_ACTIONS[action].label}
          >
            {" "}
            {text}
          </PluginActionButton>
        ))}
      </div>
    </div>
  );
}
