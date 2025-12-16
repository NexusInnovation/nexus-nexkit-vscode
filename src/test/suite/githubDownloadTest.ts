import * as assert from "assert";
import * as vscode from "vscode";
import { GitHubReleaseService } from "../../services/githubReleaseService";

/**
 * Helper function to test keeping auth header through redirects
 */
async function fetchWithRedirectsKeepAuth(
  url: string,
  init: { headers?: Record<string, string>; method?: string } = {},
  maxRedirects: number = 10
): Promise<Response> {
  let currentUrl = url;
  let redirects = 0;
  let method = init.method || "GET";
  const headers: Record<string, string> = { ...(init.headers || {}) };

  while (redirects <= maxRedirects) {
    console.log(`Fetching: ${currentUrl} (redirect ${redirects})`);
    const response = await fetch(currentUrl, {
      headers,
      method,
      redirect: "manual",
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    redirects += 1;
    if (redirects > maxRedirects) {
      throw new Error(`Too many redirects (${redirects})`);
    }

    const nextUrl = new URL(location, currentUrl).toString();
    console.log(`Redirect ${redirects}: ${nextUrl}`);

    // KEY DIFFERENCE: Keep the Authorization header for all redirects
    // (Don't remove it on host change)

    if (response.status === 303) {
      method = "GET";
    }

    currentUrl = nextUrl;
  }

  throw new Error("Redirect handling exited unexpectedly");
}

/**
 * Test suite to diagnose GitHub private repository download issues
 */
suite("GitHub Download Diagnostic Tests", () => {
  let service: GitHubReleaseService;
  const testVsixUrl =
    "https://github.com/NexusInnovation/nexus-nexkit-vscode/releases/download/v0.3.7/nexkit-vscode.vsix";

  setup(() => {
    const mockContext = {
      subscriptions: [],
      workspaceState: {
        get: () => undefined,
        update: () => Promise.resolve(),
      },
      globalState: {
        get: () => undefined,
        update: () => Promise.resolve(),
      },
    } as any;
    service = new GitHubReleaseService(mockContext);
  });

  test("Manual fetch test - Direct URL with headers", async function () {
    this.timeout(30000); // 30 seconds timeout

    try {
      // Get authentication session
      const session = await vscode.authentication.getSession(
        "github",
        ["repo"],
        { createIfNone: true, silent: false }
      );

      if (!session) {
        console.log(
          "No GitHub session available - skipping authenticated test"
        );
        return;
      }

      console.log("Testing direct fetch with Authorization header...");

      const headers = {
        "User-Agent": "Nexkit-VSCode-Extension",
        Accept: "application/octet-stream",
        Authorization: `Bearer ${session.accessToken}`,
      };

      // Test 1: Direct fetch with manual redirect handling disabled
      console.log('Test 1: Direct fetch with redirect: "manual"');
      const response1 = await fetch(testVsixUrl, {
        headers,
        redirect: "manual",
      });

      console.log(`Response status: ${response1.status}`);
      console.log(
        `Response headers: ${JSON.stringify(
          Object.fromEntries(response1.headers.entries()),
          null,
          2
        )}`
      );

      if (response1.status >= 300 && response1.status < 400) {
        const location = response1.headers.get("location");
        console.log(`Redirect location: ${location}`);

        if (location) {
          // Test the redirect location
          console.log("Test 2: Following redirect manually with Auth header");
          const redirectUrl = new URL(location, testVsixUrl).toString();
          console.log(`Redirect URL: ${redirectUrl}`);

          const response2 = await fetch(redirectUrl, {
            headers,
            redirect: "manual",
          });

          console.log(`Redirect response status: ${response2.status}`);
          console.log(
            `Redirect response headers: ${JSON.stringify(
              Object.fromEntries(response2.headers.entries()),
              null,
              2
            )}`
          );

          // Test 3: Following redirect without Auth header
          console.log("Test 3: Following redirect without Auth header");
          const headersNoAuth = {
            "User-Agent": "Nexkit-VSCode-Extension",
            Accept: "application/octet-stream",
          };

          const response3 = await fetch(redirectUrl, {
            headers: headersNoAuth,
            redirect: "manual",
          });

          console.log(`No-auth redirect response status: ${response3.status}`);
          console.log(
            `No-auth redirect response headers: ${JSON.stringify(
              Object.fromEntries(response3.headers.entries()),
              null,
              2
            )}`
          );
        }
      }

      // Test 4: Let browser handle redirects automatically
      console.log("Test 4: Automatic redirect handling");
      const response4 = await fetch(testVsixUrl, {
        headers,
        redirect: "follow",
      });

      console.log(`Auto-redirect response status: ${response4.status}`);
      console.log(`Auto-redirect final URL: ${response4.url}`);

      if (response4.ok) {
        const contentLength = response4.headers.get("content-length");
        console.log(`Content length: ${contentLength}`);
        console.log("✅ Download successful with automatic redirects!");
      }
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });

  test("Test custom fetchWithRedirects method", async function () {
    this.timeout(30000);

    try {
      const session = await vscode.authentication.getSession(
        "github",
        ["repo"],
        { createIfNone: true, silent: false }
      );

      if (!session) {
        console.log("No GitHub session available - skipping test");
        return;
      }

      console.log("Testing custom fetchWithRedirects method...");

      // We'll test the downloadVsixAsset method which uses fetchWithRedirects internally
      // First get the release info
      const release = await service.fetchLatestRelease();
      console.log(`Found release: ${release.tagName}`);

      // Try to download the vsix
      console.log("Attempting to download VSIX using service method...");
      const vsixData = await service.downloadVsixAsset(release);

      console.log(`✅ Downloaded ${vsixData.byteLength} bytes successfully!`);
    } catch (error) {
      console.error("Custom method test failed:", error);
      throw error;
    }
  });

  test("Compare download approaches for private repository", async function () {
    this.timeout(60000); // Increase timeout for downloads

    try {
      const session = await vscode.authentication.getSession(
        "github",
        ["repo"],
        { createIfNone: true, silent: false }
      );

      if (!session) {
        console.log("No GitHub session available - skipping test");
        return;
      }

      console.log("Testing different download approaches...");

      // Test the service's download method
      const release = await service.fetchLatestRelease();
      console.log(`Testing with release: ${release.tagName}`);

      try {
        console.log(
          "🔧 Testing new approach (GitHub API + improved redirect handling)..."
        );
        const vsixData = await service.downloadVsixAsset(release);
        console.log(`✅ New approach: SUCCESS (${vsixData.byteLength} bytes)`);

        // Verify it's a valid ZIP file
        const uint8Array = new Uint8Array(vsixData);
        const header = Array.from(uint8Array.slice(0, 4))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        if (header === "504b0304") {
          console.log("✅ Downloaded file has valid ZIP/VSIX header");
        } else {
          console.log(
            `⚠️  Downloaded file header: ${header} (expected: 504b0304)`
          );
        }
      } catch (error) {
        console.log(`❌ New approach: FAILED - ${error}`);
      }

      // Test manual fetch with different strategies
      const headers = {
        "User-Agent": "Nexkit-VSCode-Extension",
        Accept: "application/octet-stream",
        Authorization: `Bearer ${session.accessToken}`,
      };

      console.log("\n🔧 Testing direct browser_download_url...");
      const vsixAsset = release.assets.find((asset) =>
        asset.name.endsWith(".vsix")
      );
      if (vsixAsset) {
        try {
          const response = await fetch(vsixAsset.browserDownloadUrl, {
            headers,
            redirect: "follow", // Let fetch handle redirects automatically
          });

          if (response.ok) {
            const data = await response.arrayBuffer();
            console.log(
              `✅ Direct URL with auto-redirect: SUCCESS (${data.byteLength} bytes)`
            );
          } else {
            console.log(
              `❌ Direct URL: FAILED - ${response.status} ${response.statusText}`
            );
          }
        } catch (error) {
          console.log(`❌ Direct URL: FAILED - ${error}`);
        }
      }
    } catch (error) {
      console.error("Download comparison test failed:", error);
    }
  });
});
