/**
 * Generalized recursive GitHub folder downloader.
 *
 * Extracted from the AI-template provider's directory-download logic so any
 * feature can recursively fetch a folder from a GitHub repository via the
 * Contents API. It is intentionally free of `vscode` and
 * {@link GitHubAuthHelper} imports so it can be unit-tested with an injected
 * `fetch` implementation without booting the extension host.
 *
 * Used by:
 * - `RepositoryTemplateProvider.downloadDirectoryContents` (skills).
 * - `SquadPresetDownloadService` to fetch a preset's reserved `squad/` folder
 *   (SQD-016, PRD FR-011/FR-013) before validation (SQD-015).
 *
 * GitHub API calls always send a `User-Agent`, and non-2xx responses —
 * including rate-limit exhaustion — raise a structured {@link GitHubApiError}
 * carrying actionable remediation rather than collapsing into a silent success.
 */

/** Minimal subset of the Fetch `Response` this downloader relies on. */
export interface GitHubFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

/** Injectable `fetch`-like function. Compatible with the global `fetch`. */
export type GitHubFetchFn = (url: string, init?: { headers?: Record<string, string> }) => Promise<GitHubFetchResponse>;

/** Minimal structured logger seam (compatible with `LoggingService`). */
export interface GitHubDownloaderLogger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

const NOOP_LOGGER: GitHubDownloaderLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** A GitHub repository folder to download recursively. */
export interface GitHubFolderRef {
  owner: string;
  repo: string;
  /** Repository-relative folder path (no leading slash). */
  path: string;
  /** Branch or ref; defaults to `main`. */
  branch?: string;
}

/** Aggregated outcome of a recursive folder download. */
export interface RecursiveDownloadResult {
  /**
   * Downloaded text files keyed by their path relative to the requested folder
   * root (using `/` separators).
   */
  files: Map<string, string>;
  /**
   * Folder-relative paths the API reported as symbolic links. These are not
   * downloaded (their content is a link target, not a file) but are surfaced so
   * callers can reject them (the Squad preset contract forbids symlinks).
   */
  symlinks: string[];
  fileCount: number;
  directoryCount: number;
}

/** Structured error for a failed GitHub Contents API interaction. */
export class GitHubApiError extends Error {
  public readonly status: number;
  public readonly path: string;
  public readonly isRateLimit: boolean;
  public readonly remediation: string;

  constructor(params: {
    message: string;
    status: number;
    path: string;
    isRateLimit?: boolean;
    remediation?: string;
  }) {
    super(params.message);
    this.name = "GitHubApiError";
    this.status = params.status;
    this.path = params.path;
    this.isRateLimit = params.isRateLimit ?? false;
    this.remediation = params.remediation ?? defaultRemediation(params.status, this.isRateLimit);
  }
}

function defaultRemediation(status: number, isRateLimit: boolean): string {
  if (isRateLimit) {
    return "GitHub API rate limit exceeded. Sign in to GitHub in VS Code (or set GITHUB_TOKEN) and retry later.";
  }
  if (status === 404) {
    return "Verify the repository, branch and folder path exist and that you have access. Private repositories require GitHub authentication.";
  }
  if (status === 401 || status === 403) {
    return "Sign in to GitHub in VS Code (or set GITHUB_TOKEN) to access this repository.";
  }
  if (status >= 500) {
    return "GitHub returned a server error. Wait a moment and try again.";
  }
  return "Check the repository configuration and your network connection, then retry.";
}

/** A single entry returned by the GitHub Contents API for a directory listing. */
interface GitHubContentItem {
  name: string;
  path: string;
  download_url: string | null;
  type: string;
}

export interface GitHubRecursiveDownloaderOptions {
  /** Injected `fetch`. Defaults to the global `fetch`. */
  fetchFn?: GitHubFetchFn;
  /**
   * Provides request headers (including any `Authorization`). Defaults to an
   * unauthenticated header set carrying only the `User-Agent` and `Accept`.
   */
  getHeaders?: () => Promise<Record<string, string>>;
  /** User-Agent used by the default (unauthenticated) header provider. */
  userAgent?: string;
  logging?: GitHubDownloaderLogger;
  /** Safety cap on the number of files downloaded. Defaults to 5000. */
  maxFiles?: number;
}

/**
 * Recursively downloads the contents of a GitHub repository folder using the
 * Contents API.
 */
export class GitHubRecursiveDownloader {
  private static readonly GITHUB_API_BASE = "https://api.github.com";

  private readonly _fetch: GitHubFetchFn;
  private readonly _getHeaders: () => Promise<Record<string, string>>;
  private readonly _logging: GitHubDownloaderLogger;
  private readonly _maxFiles: number;

  constructor(options: GitHubRecursiveDownloaderOptions = {}) {
    this._fetch = options.fetchFn ?? ((url, init) => fetch(url, init) as unknown as Promise<GitHubFetchResponse>);
    const userAgent = options.userAgent ?? "Nexkit-VSCode-Extension";
    this._getHeaders =
      options.getHeaders ??
      (async () => ({
        "User-Agent": userAgent,
        Accept: "application/vnd.github.v3+json",
      }));
    this._logging = options.logging ?? NOOP_LOGGER;
    this._maxFiles = options.maxFiles ?? 5000;
  }

  /**
   * Recursively download every file under {@link GitHubFolderRef.path}.
   * Paths in the returned map are relative to that folder root.
   *
   * @throws {GitHubApiError} on any non-2xx GitHub response or when the file
   * cap is exceeded.
   */
  public async downloadFolder(ref: GitHubFolderRef): Promise<RecursiveDownloadResult> {
    const branch = ref.branch ?? "main";
    const headers = await this._getHeaders();
    const basePath = normalizeFolderPath(ref.path);

    const files = new Map<string, string>();
    const symlinks: string[] = [];
    let directoryCount = 0;

    const downloadRecursive = async (path: string): Promise<void> => {
      const items = await this.listDirectory(ref.owner, ref.repo, path, branch, headers);
      directoryCount++;

      for (const item of items) {
        const relativePath = toRelativePath(item.path, basePath);

        if (item.type === "file") {
          if (files.size >= this._maxFiles) {
            throw new GitHubApiError({
              message: `Recursive download exceeded the ${this._maxFiles}-file limit at '${item.path}'.`,
              status: 0,
              path: item.path,
              remediation: "The folder is larger than the supported limit. Narrow the source folder and retry.",
            });
          }

          const content = await this.downloadFile(item, headers);
          files.set(relativePath, content);
        } else if (item.type === "dir") {
          await downloadRecursive(item.path);
        } else if (item.type === "symlink") {
          symlinks.push(relativePath);
          this._logging.warn(`[GitHubDownload] Skipping symlink entry`, { path: item.path });
        }
      }
    };

    await downloadRecursive(basePath);

    this._logging.info(`[GitHubDownload] Folder downloaded`, {
      owner: ref.owner,
      repo: ref.repo,
      path: basePath,
      branch,
      fileCount: files.size,
      directoryCount,
      symlinkCount: symlinks.length,
    });

    return { files, symlinks, fileCount: files.size, directoryCount };
  }

  private async listDirectory(
    owner: string,
    repo: string,
    path: string,
    branch: string,
    headers: Record<string, string>,
  ): Promise<GitHubContentItem[]> {
    const apiUrl = `${GitHubRecursiveDownloader.GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodeContentsPath(path)}?ref=${encodeURIComponent(branch)}`;

    const response = await this._fetch(apiUrl, { headers });

    if (!response.ok) {
      throw this.toApiError(response, path);
    }

    const parsed = (await response.json()) as unknown;
    if (!Array.isArray(parsed)) {
      // A non-array payload means `path` pointed at a file, not a folder.
      throw new GitHubApiError({
        message: `Expected a directory at '${path}' but the GitHub API returned a single item.`,
        status: response.status,
        path,
        remediation: "Point the download at a folder path, not a file.",
      });
    }

    return parsed as GitHubContentItem[];
  }

  private async downloadFile(item: GitHubContentItem, headers: Record<string, string>): Promise<string> {
    if (!item.download_url) {
      throw new GitHubApiError({
        message: `File '${item.path}' has no download URL.`,
        status: 0,
        path: item.path,
        remediation: "The file may be too large for the Contents API. Reduce the file size or use a smaller source.",
      });
    }

    const response = await this._fetch(item.download_url, { headers });
    if (!response.ok) {
      throw this.toApiError(response, item.path);
    }

    return await response.text();
  }

  private toApiError(response: GitHubFetchResponse, path: string): GitHubApiError {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const isRateLimit = (response.status === 403 || response.status === 429) && remaining === "0";

    this._logging.error(`[GitHubDownload] GitHub API request failed`, {
      path,
      status: response.status,
      statusText: response.statusText,
      isRateLimit,
      rateLimitRemaining: remaining,
    });

    return new GitHubApiError({
      message: `GitHub API request for '${path}' failed: ${response.status} ${response.statusText}`,
      status: response.status,
      path,
      isRateLimit,
    });
  }
}

/** Strip leading/trailing slashes and normalize separators to `/`. */
function normalizeFolderPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

/** Compute a path relative to `basePath` using `/` separators. */
function toRelativePath(fullPath: string, basePath: string): string {
  const normalized = fullPath.replace(/\\/g, "/");
  if (basePath && normalized.startsWith(basePath + "/")) {
    return normalized.slice(basePath.length + 1);
  }
  if (normalized === basePath) {
    return normalized.slice(normalized.lastIndexOf("/") + 1);
  }
  return normalized;
}

/** Encode a Contents API path while preserving `/` segment separators. */
function encodeContentsPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
