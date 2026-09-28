/**
 * Upstream hierarchy recommendation rules (SQD-037, PRD FR-033/FR-034/FR-035).
 *
 * Evaluates the sources read from `.squad/upstream.json` against the
 * recommended org → team → project inheritance hierarchy and produces:
 * - one recommendation per level (always in org → team → project order) with
 *   the preconfigured Nexus marketplace suggestion and its reserved folder;
 * - visible, actionable warnings when a git source references a sub-path
 *   (`squad upstream` clones the full repository and ignores sub-paths), when
 *   a monorepo such as the Nexus marketplace would be cloned in full, when the
 *   reserved per-level folders cannot be targeted directly, and when sources
 *   are listed out of the recommended order.
 *
 * The rules are pure and deterministic: no `vscode` imports, no I/O, no
 * clock. They are safe to unit-test in isolation and to reuse anywhere.
 */

import {
  SQUAD_UPSTREAM_LEVEL_ORDER,
  SquadUpstreamKind,
  SquadUpstreamLevel,
  SquadUpstreamLevelRecommendation,
  SquadUpstreamLevelStatus,
  SquadUpstreamRecommendations,
  SquadUpstreamSource,
  SquadUpstreamWarning,
  SquadUpstreamWarningCode,
  SquadUpstreamWarningSeverity,
} from "../models";

/** Preconfigured Nexus repository suggested for every level (FR-034). */
export const NEXUS_UPSTREAM_MARKETPLACE_REPOSITORY = "NexusInnovation/nexus-plugin-marketplace";

/** Root folder, inside the marketplace, that holds one reserved folder per level. */
export const NEXUS_UPSTREAM_RESERVED_FOLDER_ROOT = "squad/upstreams";

/** Options for {@link SquadUpstreamRecommendationService}. */
export interface SquadUpstreamRecommendationOptions {
  /** `owner/repo` suggested for the Nexus levels. Defaults to the Nexus marketplace. */
  marketplaceRepository?: string;

  /** Folder inside the repository that holds the reserved per-level folders. */
  reservedFolderRoot?: string;
}

interface LevelDefinition {
  label: string;
  description: string;
  keywords: readonly string[];
}

const LEVEL_DEFINITIONS: Record<SquadUpstreamLevel, LevelDefinition> = {
  [SquadUpstreamLevel.Org]: {
    label: "Organization",
    description: "Company-wide conventions, shared agents and governance inherited by every team.",
    keywords: ["org", "orgs", "organization", "organisation", "enterprise", "company", "corp"],
  },
  [SquadUpstreamLevel.Team]: {
    label: "Team",
    description: "Team or department practices layered on top of the organization defaults.",
    keywords: ["team", "teams", "equipe", "dept", "department", "departement", "division"],
  },
  [SquadUpstreamLevel.Project]: {
    label: "Project",
    description: "Project-specific overrides shared by the repositories of a single project.",
    keywords: ["project", "projects", "projet", "projets", "product"],
  },
};

const SUBPATH_ALTERNATIVES: readonly string[] = [
  "Create a dedicated upstream repository per level (org, team, project).",
  "Generate a JSON export from the sub-folder and add it as an 'export' upstream source.",
];

/** A git reference split into its host, repository path and sub-path. */
interface ParsedGitReference {
  host: string | undefined;
  repository: string | undefined;
  subpath: string | undefined;
}

/**
 * Pure recommendation engine for the Upstreams section. Stateless; construct
 * once and call {@link recommend} for each upstream snapshot.
 */
export class SquadUpstreamRecommendationService {
  private readonly _marketplaceRepository: string;
  private readonly _reservedFolderRoot: string;

  constructor(options: SquadUpstreamRecommendationOptions = {}) {
    this._marketplaceRepository = options.marketplaceRepository ?? NEXUS_UPSTREAM_MARKETPLACE_REPOSITORY;
    this._reservedFolderRoot = (options.reservedFolderRoot ?? NEXUS_UPSTREAM_RESERVED_FOLDER_ROOT).replace(/\/+$/, "");
  }

  /** Evaluate configured sources against the org → team → project hierarchy. */
  public recommend(upstreams: readonly SquadUpstreamSource[]): SquadUpstreamRecommendations {
    const sourceIdsByLevel = new Map<SquadUpstreamLevel, string[]>(SQUAD_UPSTREAM_LEVEL_ORDER.map((level) => [level, []]));
    const unclassifiedSourceIds: string[] = [];
    const classified: { source: SquadUpstreamSource; level: SquadUpstreamLevel }[] = [];

    for (const source of upstreams) {
      const level = this.classifyLevel(source);
      if (level === undefined) {
        unclassifiedSourceIds.push(source.id);
        continue;
      }
      sourceIdsByLevel.get(level)?.push(source.id);
      classified.push({ source, level });
    }

    const levels = SQUAD_UPSTREAM_LEVEL_ORDER.map((level, index) =>
      this._levelRecommendation(level, index + 1, sourceIdsByLevel.get(level) ?? [])
    );

    const warnings: SquadUpstreamWarning[] = [
      ...upstreams.flatMap((source) => this._sourceWarnings(source)),
      ...this._orderWarnings(classified),
    ];
    if (levels.some((level) => level.status === SquadUpstreamLevelStatus.Missing)) {
      warnings.push(this._reservedFolderWarning());
    }

    return { levels, warnings, unclassifiedSourceIds };
  }

  /**
   * Infer the hierarchy level of a source from its id, falling back to its
   * reference. Returns `undefined` when no level (or more than one) matches,
   * so free sources are never force-fitted into the hierarchy.
   */
  public classifyLevel(source: SquadUpstreamSource): SquadUpstreamLevel | undefined {
    const fromId = this._matchLevels(source.id);
    if (fromId.size === 1) {
      return [...fromId][0];
    }
    if (fromId.size > 1) {
      return undefined;
    }
    const fromReference = this._matchLevels(source.reference);
    return fromReference.size === 1 ? [...fromReference][0] : undefined;
  }

  /**
   * Return the sub-path a git reference points at, or `undefined` when the
   * reference targets a repository root. Recognises GitHub/GitLab/Bitbucket
   * browse URLs (`/tree/<ref>/<path>`), `repo.git/<path>`, `repo//<path>`,
   * `?path=` (Azure DevOps), `#<ref>:<path>` fragments and `owner/repo/<path>`
   * GitHub paths and shorthands.
   */
  public detectSubpath(reference: string): string | undefined {
    return this._parseGitReference(reference).subpath;
  }

  // --- rules -------------------------------------------------------------

  private _sourceWarnings(source: SquadUpstreamSource): SquadUpstreamWarning[] {
    if (source.kind !== SquadUpstreamKind.Git) {
      return [];
    }

    const parsed = this._parseGitReference(source.reference);
    if (parsed.subpath !== undefined) {
      return [
        {
          code: SquadUpstreamWarningCode.SubpathUnsupported,
          severity: SquadUpstreamWarningSeverity.Warning,
          sourceId: source.id,
          message:
            `Upstream "${source.id}" points at the sub-path "${parsed.subpath}", but 'squad upstream' clones the ` +
            "whole git repository and does not support sub-paths. The sub-path will be ignored.",
          remediation:
            "Point this upstream at a repository root: use a dedicated repository for this level, or generate a " +
            "JSON export from the sub-folder and add it as an export source.",
          alternatives: [...SUBPATH_ALTERNATIVES],
        },
      ];
    }

    if (this._isMarketplace(parsed)) {
      return [
        {
          code: SquadUpstreamWarningCode.FullClone,
          severity: SquadUpstreamWarningSeverity.Warning,
          sourceId: source.id,
          message:
            `Upstream "${source.id}" references ${this._marketplaceRepository}. 'squad upstream' clones this ` +
            "repository in full, so every plugin and every level folder is inherited, not just one level.",
          remediation:
            `Generate a JSON export from the level folder under ${this._reservedFolderRoot}/ and add it as an ` +
            "export source, or move the level to a dedicated upstream repository.",
          alternatives: [...SUBPATH_ALTERNATIVES],
        },
      ];
    }

    return [];
  }

  private _orderWarnings(classified: { source: SquadUpstreamSource; level: SquadUpstreamLevel }[]): SquadUpstreamWarning[] {
    const warnings: SquadUpstreamWarning[] = [];
    let broadest: { index: number; level: SquadUpstreamLevel } | undefined;

    for (const { source, level } of classified) {
      const index = SQUAD_UPSTREAM_LEVEL_ORDER.indexOf(level);
      if (broadest !== undefined && index < broadest.index) {
        warnings.push({
          code: SquadUpstreamWarningCode.HierarchyOrder,
          severity: SquadUpstreamWarningSeverity.Warning,
          sourceId: source.id,
          message:
            `Upstream "${source.id}" (${LEVEL_DEFINITIONS[level].label}) is listed after a ` +
            `${LEVEL_DEFINITIONS[broadest.level].label.toLowerCase()}-level source, which breaks the recommended ` +
            "org → team → project order.",
          remediation:
            "Reorder the sources in .squad/upstream.json so broader levels come first: organization, then team, " +
            "then project.",
        });
        continue;
      }
      if (broadest === undefined || index > broadest.index) {
        broadest = { index, level };
      }
    }

    return warnings;
  }

  private _reservedFolderWarning(): SquadUpstreamWarning {
    const folders = SQUAD_UPSTREAM_LEVEL_ORDER.map((level) => this._reservedFolder(level)).join(", ");
    return {
      code: SquadUpstreamWarningCode.ReservedFolderLimitation,
      severity: SquadUpstreamWarningSeverity.Info,
      message:
        `${this._marketplaceRepository} reserves one folder per level (${folders}), but 'squad upstream' clones ` +
        "the full git repository and cannot target a single folder.",
      remediation:
        "Consume a level by generating a JSON export from its reserved folder (export source), or use a " +
        "dedicated upstream repository per level.",
      alternatives: [...SUBPATH_ALTERNATIVES],
    };
  }

  private _levelRecommendation(
    level: SquadUpstreamLevel,
    position: number,
    sourceIds: string[]
  ): SquadUpstreamLevelRecommendation {
    const definition = LEVEL_DEFINITIONS[level];
    return {
      level,
      position,
      label: definition.label,
      description: definition.description,
      status: sourceIds.length > 0 ? SquadUpstreamLevelStatus.Configured : SquadUpstreamLevelStatus.Missing,
      sourceIds,
      suggestion: {
        repository: this._marketplaceRepository,
        url: `https://github.com/${this._marketplaceRepository}.git`,
        reservedFolder: this._reservedFolder(level),
        recommendedKind: SquadUpstreamKind.Export,
        subpathSupported: false,
      },
    };
  }

  // --- helpers -----------------------------------------------------------

  private _reservedFolder(level: SquadUpstreamLevel): string {
    return `${this._reservedFolderRoot}/${level}`;
  }

  private _matchLevels(text: string): Set<SquadUpstreamLevel> {
    const tokens = new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 0)
    );
    const matches = new Set<SquadUpstreamLevel>();
    for (const level of SQUAD_UPSTREAM_LEVEL_ORDER) {
      if (LEVEL_DEFINITIONS[level].keywords.some((keyword) => tokens.has(keyword))) {
        matches.add(level);
      }
    }
    return matches;
  }

  private _isMarketplace(parsed: ParsedGitReference): boolean {
    if (parsed.repository === undefined) {
      return false;
    }
    const isGitHub = parsed.host === undefined || parsed.host === "github.com";
    return isGitHub && parsed.repository.toLowerCase() === this._marketplaceRepository.toLowerCase();
  }

  private _parseGitReference(reference: string): ParsedGitReference {
    const trimmed = reference.trim();
    let host: string | undefined;
    let path: string;
    let subpath: string | undefined;

    const fragmentIndex = trimmed.indexOf("#");
    const withoutFragment = fragmentIndex >= 0 ? trimmed.slice(0, fragmentIndex) : trimmed;
    const fragment = fragmentIndex >= 0 ? trimmed.slice(fragmentIndex + 1) : "";
    subpath = this._subpathFromFragment(fragment);

    const scpLike = /^[\w.-]+@([^:/]+):(.+)$/.exec(withoutFragment);
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(withoutFragment)) {
      let url: URL;
      try {
        url = new URL(withoutFragment);
      } catch {
        return { host: undefined, repository: undefined, subpath };
      }
      host = url.hostname.toLowerCase();
      path = decodeURIComponent(url.pathname);
      subpath ??= this._normalizeSubpath(url.searchParams.get("path") ?? "");
    } else if (scpLike) {
      host = scpLike[1].toLowerCase();
      path = scpLike[2];
    } else if (/^[\w.-]+\/[\w.-]+(\/.*)?$/.test(withoutFragment)) {
      // `owner/repo[/sub]` shorthand resolves on GitHub.
      host = undefined;
      path = withoutFragment;
    } else {
      return { host: undefined, repository: undefined, subpath };
    }

    const fromPath = this._splitRepositoryPath(path, host);
    return { host, repository: fromPath.repository, subpath: subpath ?? fromPath.subpath };
  }

  private _splitRepositoryPath(
    path: string,
    host: string | undefined
  ): { repository: string | undefined; subpath: string | undefined } {
    const clean = path.replace(/^\/+/, "").replace(/\/+$/, "");

    const doubleSlash = clean.indexOf("//");
    if (doubleSlash >= 0) {
      return {
        repository: this._stripGitSuffix(clean.slice(0, doubleSlash)),
        subpath: this._normalizeSubpath(clean.slice(doubleSlash + 2)),
      };
    }

    const dotGit = /^(.*?)\.git\/(.+)$/i.exec(clean);
    if (dotGit) {
      return { repository: dotGit[1], subpath: this._normalizeSubpath(dotGit[2]) };
    }

    const segments = clean.split("/").filter((segment) => segment.length > 0);
    const browseMarkers = host?.includes("bitbucket") ? ["tree", "blob", "src"] : ["tree", "blob"];
    // `owner/repo/tree/<ref>/…` (GitHub, Bitbucket) or `group/…/repo/-/tree/<ref>/…` (GitLab).
    const browse = segments.findIndex(
      (segment, index) => browseMarkers.includes(segment) && (index === 2 || (index > 2 && segments[index - 1] === "-"))
    );
    if (browse >= 0) {
      const repoSegments = segments.slice(0, segments[browse - 1] === "-" ? browse - 1 : browse);
      return {
        repository: this._stripGitSuffix(repoSegments.join("/")),
        subpath: this._normalizeSubpath(segments.slice(browse + 2).join("/")),
      };
    }

    const isGitHub = host === undefined || host === "github.com";
    if (isGitHub && segments.length > 2) {
      return {
        repository: this._stripGitSuffix(segments.slice(0, 2).join("/")),
        subpath: this._normalizeSubpath(segments.slice(2).join("/")),
      };
    }

    return { repository: this._stripGitSuffix(segments.join("/")), subpath: undefined };
  }

  private _subpathFromFragment(fragment: string): string | undefined {
    if (fragment.length === 0) {
      return undefined;
    }
    const pathParam = /(?:^|[&;])path=([^&;]*)/i.exec(fragment);
    if (pathParam) {
      return this._normalizeSubpath(decodeURIComponent(pathParam[1]));
    }
    const colon = fragment.indexOf(":");
    return colon >= 0 ? this._normalizeSubpath(fragment.slice(colon + 1)) : undefined;
  }

  private _normalizeSubpath(value: string): string | undefined {
    const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
    return normalized.length > 0 ? normalized : undefined;
  }

  private _stripGitSuffix(value: string): string {
    return value.replace(/\.git$/i, "");
  }
}
