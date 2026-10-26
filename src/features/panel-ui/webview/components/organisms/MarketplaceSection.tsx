import { useEffect, useMemo, useState } from "preact/hooks";
import { useMarketplaces } from "../../hooks/useMarketplaces";
import { SkeletonList } from "../atoms/Skeleton";
import { MarketplaceNode, PluginNode } from "../../../../marketplace-management/models/marketplace";

type ToggleState = "on" | "off" | "mixed";

function marketplaceState(node: MarketplaceNode): ToggleState {
  const toggleable = node.plugins.filter((p) => p.path);
  const enabled = toggleable.filter((p) => p.enabled).length;
  if (toggleable.length === 0 || enabled === 0) {
    return "off";
  }
  return enabled === toggleable.length ? "on" : "mixed";
}

function groupByCategory(plugins: PluginNode[]): Array<[string | undefined, PluginNode[]]> {
  const groups = new Map<string | undefined, PluginNode[]>();
  for (const plugin of plugins) {
    const list = groups.get(plugin.category) ?? [];
    list.push(plugin);
    groups.set(plugin.category, list);
  }
  return [...groups.entries()];
}

function EyeButton({
  state,
  label,
  disabled,
  onToggle,
}: {
  state: ToggleState;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const icon = state === "off" ? "codicon-eye-closed" : "codicon-eye";
  const title = disabled ? `${label}: not available locally` : state === "off" ? `Enable ${label}` : `Disable ${label}`;
  return (
    <button
      class={`tree-action eye-${state}`}
      title={title}
      aria-label={title}
      aria-pressed={state === "mixed" ? "mixed" : state === "on"}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <i class={`codicon ${icon}`}></i>
    </button>
  );
}

const BLOCKED_TOOLTIP =
  "Disabled in the VS Code profile: this plugin is not available in chat even if Nexkit enables it. Click to open Agent Customizations › Plugins and enable it there.";

function PluginRow({
  plugin,
  depth,
  onToggle,
  onOpenVsCode,
}: {
  plugin: PluginNode;
  depth: number;
  onToggle: (p: PluginNode) => void;
  onOpenVsCode: () => void;
}) {
  return (
    <div
      class={`tree-row plugin-row ${plugin.enabled && !plugin.blockedByVsCode ? "" : "is-disabled"}`}
      role="treeitem"
      style={{ paddingLeft: `${depth * 12 + 22}px` }}
      title={
        plugin.installedByVsCode
          ? `${plugin.description ?? plugin.name}\n\nInstalled through the VS Code plugin browser. Toggling hands control over to Nexkit (chat.pluginLocations).`
          : plugin.description
      }
    >
      <i class="codicon codicon-extensions tree-icon"></i>
      <span class="tree-label">{plugin.name}</span>
      <span class="tree-actions">
        {plugin.blockedByVsCode && (
          <button
            class="tree-action blocked-by-vscode"
            title={BLOCKED_TOOLTIP}
            aria-label={BLOCKED_TOOLTIP}
            onClick={(e) => {
              e.stopPropagation();
              onOpenVsCode();
            }}
          >
            <i class="codicon codicon-lock"></i>
          </button>
        )}
        <EyeButton
          state={plugin.enabled ? "on" : "off"}
          label={`plugin "${plugin.name}"`}
          disabled={!plugin.path}
          onToggle={() => onToggle(plugin)}
        />
      </span>
    </div>
  );
}

/**
 * MarketplaceSection Component
 * Explorer-like tree of plugin marketplaces (chat.plugins.marketplaces) and their plugins.
 * Plugins are enabled/disabled through chat.pluginLocations.
 */
export function MarketplaceSection() {
  const {
    tree: serverTree,
    suggested,
    isReady,
    error,
    addMarketplace,
    removeMarketplace,
    toggleMarketplace: sendToggleMarketplace,
    togglePlugin: sendTogglePlugin,
    openMarketplaceRepo,
    openVsCodePluginSettings,
    refreshMarketplaces,
    openPluginBrowser,
  } = useMarketplaces();

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newSource, setNewSource] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // Optimistic plugin states (path → enabled) shown until the extension confirms them.
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    setOverrides((prev) => {
      if (prev.size === 0) {
        return prev;
      }
      const confirmed = new Map(serverTree.flatMap((m) => m.plugins).map((p) => [p.path, p.enabled]));
      const next = new Map([...prev].filter(([path, enabled]) => confirmed.get(path) !== enabled));
      return next.size === prev.size ? prev : next;
    });
  }, [serverTree]);

  const tree = useMemo(
    () =>
      overrides.size === 0
        ? serverTree
        : serverTree.map((m) => ({
            ...m,
            plugins: m.plugins.map((p) => (p.path && overrides.has(p.path) ? { ...p, enabled: overrides.get(p.path)! } : p)),
          })),
    [serverTree, overrides]
  );

  const applyOverrides = (paths: string[], enabled: boolean) =>
    setOverrides((prev) => {
      const next = new Map(prev);
      paths.forEach((path) => next.set(path, enabled));
      return next;
    });

  const togglePlugin = (path: string, enabled: boolean) => {
    applyOverrides([path], enabled);
    sendTogglePlugin(path, enabled);
  };

  const toggleMarketplace = (source: string, enabled: boolean) => {
    const node = tree.find((m) => m.source === source);
    applyOverrides(node?.plugins.map((p) => p.path).filter((p): p is string => !!p) ?? [], enabled);
    sendToggleMarketplace(source, enabled);
  };

  useEffect(() => {
    if (error) {
      setOverrides(new Map());
    }
  }, [error]);

  useEffect(() => {
    if (!menuFor) {
      return;
    }
    const close = () => setMenuFor(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuFor]);

  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  const closeForm = () => {
    setIsAddingNew(false);
    setNewSource("");
    setLocalError(null);
  };

  const handleSubmit = () => {
    const trimmed = newSource.trim();
    if (!trimmed) {
      setLocalError("Please enter a GitHub repository (owner/repo) or a git URL");
      return;
    }
    addMarketplace(trimmed);
    closeForm();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    } else if (e.key === "Escape") {
      closeForm();
    }
  };

  if (!isReady) {
    return <SkeletonList label="Loading marketplaces" rows={3} />;
  }

  const nexus = suggested.find((s) => s.isNexus);
  const otherSuggestions = suggested.filter((s) => !s.isNexus && !s.isConfigured);
  const displayError = localError || error;
  const onTogglePlugin = (p: PluginNode) => {
    if (p.path) {
      togglePlugin(p.path, !p.enabled);
    }
  };

  return (
    <>
      <div class="tree-header">
        <span class="tree-header-title">Marketplaces</span>
        <span class="tree-actions always-visible">
          <button class="tree-action" title="Browse plugins" onClick={openPluginBrowser}>
            <i class="codicon codicon-search"></i>
          </button>
          <button class="tree-action" title="Expand All" onClick={() => setCollapsed(new Set())}>
            <i class="codicon codicon-expand-all"></i>
          </button>
          <button
            class="tree-action"
            title="Collapse All"
            onClick={() =>
              setCollapsed(
                new Set(
                  tree.flatMap((node) => [
                    node.source,
                    ...groupByCategory(node.plugins).map(([c]) => `${node.source}::${c ?? ""}`),
                  ])
                )
              )
            }
          >
            <i class="codicon codicon-collapse-all"></i>
          </button>
          <button class="tree-action" title="Refresh" onClick={refreshMarketplaces}>
            <i class="codicon codicon-refresh"></i>
          </button>
          <button
            class="tree-action"
            title="Add marketplace"
            onClick={() => {
              setIsAddingNew(true);
              setLocalError(null);
            }}
          >
            <i class="codicon codicon-add"></i>
          </button>
        </span>
      </div>

      {isAddingNew && (
        <div class="add-connection-form">
          <input
            type="text"
            class="connection-url-input"
            placeholder="owner/repo or https://github.com/owner/repo"
            value={newSource}
            onInput={(e) => setNewSource((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
            autofocus
          />
          <div class="add-connection-actions">
            <button class="button secondary" onClick={closeForm}>
              Cancel
            </button>
            <button class="button primary" onClick={handleSubmit}>
              Add
            </button>
          </div>
        </div>
      )}

      {nexus && !nexus.isConfigured && (
        <div class="marketplace-highlight">
          <div class="marketplace-highlight-title">
            <i class="codicon codicon-verified"></i> {nexus.name}
          </div>
          <div class="connection-details">{nexus.description}</div>
          <button class="button primary" onClick={() => addMarketplace(nexus.source)}>
            <i class="codicon codicon-add"></i> Add Nexus Marketplace
          </button>
        </div>
      )}

      {tree.length === 0 && !isAddingNew && <p class="empty-message">No plugin marketplaces configured.</p>}

      <div class="tree" role="tree">
        {tree.map((node) => {
          const isOpen = !collapsed.has(node.source);
          const state = marketplaceState(node);
          const groups = groupByCategory(node.plugins);
          const hasCategories = groups.length > 1 || (groups.length === 1 && groups[0][0] !== undefined);
          return (
            <div key={node.source} role="treeitem" aria-expanded={isOpen}>
              <div
                class={`tree-row marketplace-row ${state === "off" ? "is-disabled" : ""}`}
                title={node.source}
                onClick={() => toggleCollapsed(node.source)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuFor(node.source);
                }}
              >
                <i class={`codicon codicon-chevron-${isOpen ? "down" : "right"} tree-twistie`}></i>
                <i class={`codicon ${node.isNexus ? "codicon-verified" : "codicon-repo"} tree-icon`}></i>
                <span class="tree-label">{node.name}</span>
                {node.name !== node.source && <span class="tree-description">{node.source}</span>}
                <span class="tree-actions">
                  <EyeButton
                    state={state}
                    label={`all plugins of "${node.name}"`}
                    disabled={!node.plugins.some((p) => p.path)}
                    onToggle={() => toggleMarketplace(node.source, state !== "on")}
                  />
                  <button
                    class="tree-action"
                    title="More actions..."
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuFor(menuFor === node.source ? null : node.source);
                    }}
                  >
                    <i class="codicon codicon-ellipsis"></i>
                  </button>
                </span>
              </div>

              {menuFor === node.source && (
                <div class="context-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                  {[
                    {
                      icon: "link-external",
                      label: "Open Repository",
                      run: () => openMarketplaceRepo(node.source),
                      hidden: !node.url,
                    },
                    { icon: "search", label: "Browse Plugins", run: openPluginBrowser },
                    { icon: "eye", label: "Enable All Plugins", run: () => toggleMarketplace(node.source, true) },
                    { icon: "eye-closed", label: "Disable All Plugins", run: () => toggleMarketplace(node.source, false) },
                    { icon: "refresh", label: "Refresh", run: refreshMarketplaces },
                    { icon: "trash", label: "Remove Marketplace", run: () => removeMarketplace(node.source) },
                  ]
                    .filter((item) => !item.hidden)
                    .map((item) => (
                      <button
                        key={item.label}
                        class="context-menu-item"
                        role="menuitem"
                        onClick={() => {
                          setMenuFor(null);
                          item.run();
                        }}
                      >
                        <i class={`codicon codicon-${item.icon}`}></i> {item.label}
                      </button>
                    ))}
                </div>
              )}

              {isOpen && (
                <div role="group">
                  {!node.isAvailable && (
                    <div class="tree-row tree-hint" style={{ paddingLeft: "22px" }}>
                      Not synced locally yet.&nbsp;
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          openPluginBrowser();
                        }}
                      >
                        Browse plugins
                      </a>
                    </div>
                  )}
                  {node.isAvailable && node.plugins.length === 0 && (
                    <div class="tree-row tree-hint" style={{ paddingLeft: "22px" }}>
                      No plugins in this marketplace.
                    </div>
                  )}
                  {hasCategories
                    ? groups.map(([category, plugins]) => {
                        const key = `${node.source}::${category ?? ""}`;
                        const groupOpen = !collapsed.has(key);
                        return (
                          <div key={key} role="treeitem" aria-expanded={groupOpen}>
                            <div
                              class="tree-row category-row"
                              style={{ paddingLeft: "12px" }}
                              onClick={() => toggleCollapsed(key)}
                            >
                              <i class={`codicon codicon-chevron-${groupOpen ? "down" : "right"} tree-twistie`}></i>
                              <i class="codicon codicon-folder tree-icon"></i>
                              <span class="tree-label">{category ?? "Other"}</span>
                              <span class="tree-badge">{plugins.length}</span>
                            </div>
                            {groupOpen &&
                              plugins.map((p) => (
                                <PluginRow
                                  key={p.name}
                                  plugin={p}
                                  depth={1}
                                  onToggle={onTogglePlugin}
                                  onOpenVsCode={openVsCodePluginSettings}
                                />
                              ))}
                          </div>
                        );
                      })
                    : node.plugins.map((p) => (
                        <PluginRow
                          key={p.name}
                          plugin={p}
                          depth={0}
                          onToggle={onTogglePlugin}
                          onOpenVsCode={openVsCodePluginSettings}
                        />
                      ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {otherSuggestions.length > 0 && (
        <>
          <div class="tree-header">
            <span class="tree-header-title">Suggested</span>
          </div>
          <div class="tree">
            {otherSuggestions.map((s) => (
              <div key={s.source} class="tree-row" title={s.description}>
                <i class="codicon codicon-repo tree-icon"></i>
                <span class="tree-label">{s.name}</span>
                <span class="tree-description">{s.source}</span>
                <span class="tree-actions">
                  <button class="tree-action" onClick={() => addMarketplace(s.source)} title={`Add marketplace "${s.source}"`}>
                    <i class="codicon codicon-add"></i>
                  </button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {displayError && <div class="connection-error">{displayError}</div>}
    </>
  );
}
