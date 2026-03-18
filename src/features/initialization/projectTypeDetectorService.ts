import * as path from "path";
import { fileExists } from "../../shared/utils/fileHelper";
import { LoggingService } from "../../shared/services/loggingService";

/**
 * Supported project types that can be detected
 */
export type ProjectType = "nodejs" | "dotnet" | "python" | "unknown";

/**
 * Result of project type detection
 */
export interface ProjectTypeResult {
  type: ProjectType;
  confidence: "high" | "medium" | "low";
  hints: string[];
}

/**
 * Marker files used to detect project types
 */
const PROJECT_MARKERS: Record<ProjectType, string[]> = {
  nodejs: ["package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "node_modules"],
  dotnet: ["*.csproj", "*.fsproj", "*.sln", "global.json", "nuget.config"],
  python: ["pyproject.toml", "setup.py", "requirements.txt", "Pipfile", "poetry.lock", "tox.ini"],
  unknown: [],
};

/**
 * Service that detects the project type of the current workspace
 * by checking for well-known marker files.
 */
export class ProjectTypeDetectorService {
  private readonly _logging = LoggingService.getInstance();

  /**
   * Detect the project type in the given workspace root.
   * Checks for well-known marker files and returns the best match.
   * @param workspaceRoot Absolute path to the workspace root
   * @returns Detection result with type, confidence, and matching hints
   */
  public async detectProjectType(workspaceRoot: string): Promise<ProjectTypeResult> {
    this._logging.info("Detecting project type...");

    const results: { type: ProjectType; matchCount: number; hints: string[] }[] = [];

    for (const [type, markers] of Object.entries(PROJECT_MARKERS)) {
      if (type === "unknown") {
        continue;
      }
      const hints: string[] = [];
      for (const marker of markers) {
        if (marker.startsWith("*")) {
          // Glob pattern — skip (would need readdir), check exact files only
          continue;
        }
        const markerPath = path.join(workspaceRoot, marker);
        if (await fileExists(markerPath)) {
          hints.push(marker);
        }
      }
      if (hints.length > 0) {
        results.push({ type: type as ProjectType, matchCount: hints.length, hints });
      }
    }

    // Also check for .csproj/.fsproj/.sln via directory listing
    const dotnetGlobHints = await this._checkDotnetGlobMarkers(workspaceRoot);
    if (dotnetGlobHints.length > 0) {
      const existing = results.find((r) => r.type === "dotnet");
      if (existing) {
        existing.hints.push(...dotnetGlobHints);
        existing.matchCount += dotnetGlobHints.length;
      } else {
        results.push({ type: "dotnet", matchCount: dotnetGlobHints.length, hints: dotnetGlobHints });
      }
    }

    if (results.length === 0) {
      this._logging.info("No project type detected.");
      return { type: "unknown", confidence: "low", hints: [] };
    }

    // Sort by match count descending — best match first
    results.sort((a, b) => b.matchCount - a.matchCount);
    const best = results[0];

    const confidence = best.matchCount >= 3 ? "high" : best.matchCount >= 2 ? "medium" : "low";

    this._logging.info(`Detected project type: ${best.type} (confidence: ${confidence}, hints: ${best.hints.join(", ")})`);

    return { type: best.type, confidence, hints: best.hints };
  }

  /**
   * Check for .csproj, .fsproj, .sln files in the workspace root (glob patterns)
   */
  private async _checkDotnetGlobMarkers(workspaceRoot: string): Promise<string[]> {
    const hints: string[] = [];
    try {
      const { promises: fsp } = await import("fs");
      const entries = await fsp.readdir(workspaceRoot);
      for (const entry of entries) {
        if (entry.endsWith(".csproj") || entry.endsWith(".fsproj") || entry.endsWith(".sln")) {
          hints.push(entry);
        }
      }
    } catch {
      // Directory read failed — not critical
    }
    return hints;
  }
}
