/**
 * Unit tests for the generalized recursive GitHub folder downloader
 * (SQD-016). These run without the VS Code extension host: the downloader is
 * `vscode`-free and its `fetch` seam is injected.
 */

import * as assert from "assert";
import {
  GitHubApiError,
  GitHubFetchResponse,
  GitHubRecursiveDownloader,
} from "../../src/shared/utils/githubRecursiveDownloader";

/** Build a minimal fake `Response` for a JSON directory listing. */
function jsonResponse(body: unknown, headers: Record<string, string> = {}): GitHubFetchResponse {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** Build a minimal fake `Response` carrying raw text (a downloaded file). */
function textResponse(text: string): GitHubFetchResponse {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => null },
    json: async () => JSON.parse(text),
    text: async () => text,
  };
}

/** Build a fake error `Response`. */
function errorResponse(
  status: number,
  statusText: string,
  headers: Record<string, string> = {},
): GitHubFetchResponse {
  return {
    ok: false,
    status,
    statusText,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => ({}),
    text: async () => "",
  };
}

interface DirItem {
  name: string;
  path: string;
  download_url: string | null;
  type: string;
}

function file(path: string): DirItem {
  return { name: path.split("/").pop()!, path, download_url: `https://raw/${path}`, type: "file" };
}
function dir(path: string): DirItem {
  return { name: path.split("/").pop()!, path, download_url: null, type: "dir" };
}
function symlink(path: string): DirItem {
  return { name: path.split("/").pop()!, path, download_url: null, type: "symlink" };
}

suite("Unit: GitHubRecursiveDownloader", () => {
  test("Recursively downloads a nested folder into folder-relative paths", async () => {
    const listings: Record<string, DirItem[]> = {
      squad: [file("squad/manifest.json"), file("squad/team.md"), dir("squad/agents")],
      "squad/agents": [dir("squad/agents/link")],
      "squad/agents/link": [file("squad/agents/link/charter.md")],
    };
    const fileContents: Record<string, string> = {
      "https://raw/squad/manifest.json": '{"id":"x"}',
      "https://raw/squad/team.md": "# Team",
      "https://raw/squad/agents/link/charter.md": "# Link",
    };

    const requestedUrls: string[] = [];
    const fetchFn = async (url: string): Promise<GitHubFetchResponse> => {
      requestedUrls.push(url);
      const listingMatch = url.match(/\/contents\/([^?]+)\?ref=/);
      if (listingMatch) {
        const path = decodeURIComponent(listingMatch[1]);
        return jsonResponse(listings[path]);
      }
      return textResponse(fileContents[url]);
    };

    const downloader = new GitHubRecursiveDownloader({ fetchFn });
    const result = await downloader.downloadFolder({ owner: "o", repo: "r", path: "squad" });

    assert.deepStrictEqual(
      [...result.files.keys()].sort(),
      ["agents/link/charter.md", "manifest.json", "team.md"],
    );
    assert.strictEqual(result.files.get("manifest.json"), '{"id":"x"}');
    assert.strictEqual(result.files.get("agents/link/charter.md"), "# Link");
    assert.strictEqual(result.fileCount, 3);
    assert.strictEqual(result.directoryCount, 3);
    assert.deepStrictEqual(result.symlinks, []);
    // Default branch is main.
    assert.ok(requestedUrls[0].includes("ref=main"));
  });

  test("Captures symlink entries without downloading them", async () => {
    const listings: Record<string, DirItem[]> = {
      squad: [file("squad/team.md"), symlink("squad/evil")],
    };
    const fetchFn = async (url: string): Promise<GitHubFetchResponse> => {
      const listingMatch = url.match(/\/contents\/([^?]+)\?ref=/);
      if (listingMatch) {
        return jsonResponse(listings[decodeURIComponent(listingMatch[1])]);
      }
      return textResponse("# Team");
    };

    const downloader = new GitHubRecursiveDownloader({ fetchFn });
    const result = await downloader.downloadFolder({ owner: "o", repo: "r", path: "squad" });

    assert.deepStrictEqual(result.symlinks, ["evil"]);
    assert.deepStrictEqual([...result.files.keys()], ["team.md"]);
  });

  test("Sends a User-Agent header and honours a custom branch", async () => {
    let seenHeaders: Record<string, string> | undefined;
    let seenUrl = "";
    const fetchFn = async (url: string, init?: { headers?: Record<string, string> }) => {
      seenHeaders = init?.headers;
      seenUrl = url;
      return jsonResponse([]);
    };

    const downloader = new GitHubRecursiveDownloader({ fetchFn });
    await downloader.downloadFolder({ owner: "o", repo: "r", path: "squad", branch: "develop" });

    assert.ok(seenHeaders?.["User-Agent"], "expected a User-Agent header");
    assert.ok(seenUrl.includes("ref=develop"));
  });

  test("Uses injected auth headers when provided", async () => {
    let seenHeaders: Record<string, string> | undefined;
    const fetchFn = async (_url: string, init?: { headers?: Record<string, string> }) => {
      seenHeaders = init?.headers;
      return jsonResponse([]);
    };

    const downloader = new GitHubRecursiveDownloader({
      fetchFn,
      getHeaders: async () => ({ "User-Agent": "UA", Authorization: "token abc" }),
    });
    await downloader.downloadFolder({ owner: "o", repo: "r", path: "squad" });

    assert.strictEqual(seenHeaders?.["Authorization"], "token abc");
  });

  test("Throws a structured GitHubApiError on 404", async () => {
    const fetchFn = async (): Promise<GitHubFetchResponse> => errorResponse(404, "Not Found");
    const downloader = new GitHubRecursiveDownloader({ fetchFn });

    await assert.rejects(
      () => downloader.downloadFolder({ owner: "o", repo: "r", path: "missing" }),
      (error: unknown) => {
        assert.ok(error instanceof GitHubApiError);
        assert.strictEqual(error.status, 404);
        assert.strictEqual(error.isRateLimit, false);
        assert.ok(error.remediation.length > 0);
        return true;
      },
    );
  });

  test("Flags rate-limit exhaustion (403 with remaining 0)", async () => {
    const fetchFn = async (): Promise<GitHubFetchResponse> =>
      errorResponse(403, "Forbidden", { "x-ratelimit-remaining": "0" });
    const downloader = new GitHubRecursiveDownloader({ fetchFn });

    await assert.rejects(
      () => downloader.downloadFolder({ owner: "o", repo: "r", path: "squad" }),
      (error: unknown) => {
        assert.ok(error instanceof GitHubApiError);
        assert.strictEqual(error.isRateLimit, true);
        assert.ok(/rate limit/i.test(error.remediation));
        return true;
      },
    );
  });

  test("Throws when a file has no download URL", async () => {
    const listings: Record<string, DirItem[]> = {
      squad: [{ name: "big", path: "squad/big", download_url: null, type: "file" }],
    };
    const fetchFn = async (url: string): Promise<GitHubFetchResponse> => {
      const listingMatch = url.match(/\/contents\/([^?]+)\?ref=/);
      return jsonResponse(listingMatch ? listings[decodeURIComponent(listingMatch[1])] : []);
    };
    const downloader = new GitHubRecursiveDownloader({ fetchFn });

    await assert.rejects(() => downloader.downloadFolder({ owner: "o", repo: "r", path: "squad" }), GitHubApiError);
  });

  test("Throws when the path resolves to a single file, not a folder", async () => {
    const fetchFn = async (): Promise<GitHubFetchResponse> =>
      jsonResponse({ name: "manifest.json", path: "squad/manifest.json", type: "file", download_url: "x" });
    const downloader = new GitHubRecursiveDownloader({ fetchFn });

    await assert.rejects(
      () => downloader.downloadFolder({ owner: "o", repo: "r", path: "squad/manifest.json" }),
      GitHubApiError,
    );
  });

  test("Enforces the max-file safety cap", async () => {
    const listings: Record<string, DirItem[]> = {
      squad: [file("squad/a.md"), file("squad/b.md"), file("squad/c.md")],
    };
    const fetchFn = async (url: string): Promise<GitHubFetchResponse> => {
      const listingMatch = url.match(/\/contents\/([^?]+)\?ref=/);
      if (listingMatch) {
        return jsonResponse(listings[decodeURIComponent(listingMatch[1])]);
      }
      return textResponse("x");
    };
    const downloader = new GitHubRecursiveDownloader({ fetchFn, maxFiles: 2 });

    await assert.rejects(
      () => downloader.downloadFolder({ owner: "o", repo: "r", path: "squad" }),
      (error: unknown) => {
        assert.ok(error instanceof GitHubApiError);
        assert.ok(/limit/i.test(error.message));
        return true;
      },
    );
  });
});
