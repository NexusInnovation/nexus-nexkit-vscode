/**
 * Test runner for Nexkit VS Code Extension
 * Configures @vscode/test-electron for headless extension testing
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    // Set test mode flag to prevent UI dialogs
    process.env.VSCODE_TEST_MODE = "true";

    // Use isolated directories per run to avoid VS Code mutex/profile conflicts
    // (especially on Windows where a shared user-data-dir can cause failures).
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-nexkit-vscode-test-"));
    const userDataDir = path.join(baseDir, "user-data");
    const extensionsDir = path.join(baseDir, "extensions");
    const workspaceDir = path.join(baseDir, "workspace");
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(extensionsDir, { recursive: true });
    fs.mkdirSync(workspaceDir, { recursive: true });

    // Setup GitHub authentication for tests
    setupGitHubAuthentication(userDataDir);

    // The folder containing the Extension Manifest package.json
    const extensionDevelopmentPath = path.resolve(__dirname, "../");

    // The path to test runner (this file compiles to out/test/runTest.js)
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      // Increase download idle timeout to avoid flaky failures on slower networks.
      timeout: 60000,
      launchArgs: [
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
        "--disable-extensions", // Disable other extensions during tests
        "--disable-gpu",
        `${workspaceDir}`, // Open a temporary empty workspace
      ],
    });
  } catch (err) {
    console.error("Failed to run tests:", err);
    process.exit(1);
  }
}

/**
 * Setup GitHub authentication for tests
 * - CI/CD: Uses GITHUB_TOKEN environment variable
 * - Local Dev: Copies authentication from user's VS Code profile
 */
function setupGitHubAuthentication(testUserDataDir: string): void {
  const env = detectEnvironment();

  console.log("\n🔐 Setting up GitHub authentication for tests...");
  console.log(`   Environment: ${env}`);

  // Check for environment token (CI/CD)
  const envToken = getGitHubTokenFromEnv();
  if (envToken) {
    console.log("✅ Using GitHub token from environment variable");
    return;
  }

  // Check if we should skip authentication copy
  if (process.env.SKIP_AUTH_COPY === "true") {
    console.log("⏭️  Skipping authentication copy (SKIP_AUTH_COPY=true)");
    return;
  }

  // For CI without token, warn but continue
  if (env === "ci") {
    console.warn("⚠️  Running in CI without GITHUB_TOKEN. Tests may fail for private repositories.");
    console.warn("   Set GITHUB_TOKEN environment variable for authenticated requests.");
    return;
  }

  // For local development, try to copy authentication from user profile
  if (env === "local" || env === "test") {
    const vscodeInfo = getVSCodeInfo();
    console.log(`   VS Code installations: ${JSON.stringify(vscodeInfo)}`);

    if (!vscodeInfo.hasGitHubAuth) {
      console.log("ℹ️  No GitHub authentication found in VS Code profile.");
      console.log("   Sign in to GitHub in VS Code for authenticated test requests.");
      return;
    }

    // Copy authentication to test instance
    const copied = copyGitHubAuthToTest(testUserDataDir);
    if (!copied) {
      console.warn("⚠️  Failed to copy GitHub authentication. Tests will run without authentication.");
    }
  }
}

/**
 * Detect execution environment
 */
function detectEnvironment(): "ci" | "local" | "test" {
  if (
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.TF_BUILD ||
    process.env.JENKINS_HOME ||
    process.env.TRAVIS
  ) {
    return "ci";
  }

  if (process.env.VSCODE_TEST_MODE) {
    return "test";
  }

  return "local";
}

/**
 * Get GitHub token from environment variables
 */
function getGitHubTokenFromEnv(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
}

/**
 * Get VS Code user data directory
 */
function getUserDataDir(variant: "code" | "code-insiders" | "code-oss" = "code"): string | null {
  const platform = process.platform;
  const homeDir = os.homedir();

  const variantName =
    variant === "code-insiders" ? "Code - Insiders" : variant === "code-oss" ? "Code - OSS" : "Code";

  let userDataDir: string;

  switch (platform) {
    case "win32":
      userDataDir = path.join(process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"), variantName);
      break;
    case "darwin":
      userDataDir = path.join(homeDir, "Library", "Application Support", variantName);
      break;
    case "linux":
      userDataDir = path.join(homeDir, ".config", variantName);
      break;
    default:
      return null;
  }

  return fs.existsSync(userDataDir) ? userDataDir : null;
}

/**
 * Find first available VS Code user data directory
 */
function findUserDataDir(): string | null {
  const variants: Array<"code" | "code-insiders" | "code-oss"> = ["code", "code-insiders", "code-oss"];
  for (const variant of variants) {
    const dir = getUserDataDir(variant);
    if (dir) {
      return dir;
    }
  }
  return null;
}

/**
 * Get GitHub auth storage directory
 */
function getGitHubAuthStorageDir(userDataDir: string): string {
  return path.join(userDataDir, "User", "globalStorage", "vscode.github-authentication");
}

/**
 * Check if GitHub auth exists
 */
function hasGitHubAuth(): boolean {
  const userDataDir = findUserDataDir();
  if (!userDataDir) {
    return false;
  }
  return fs.existsSync(getGitHubAuthStorageDir(userDataDir));
}

/**
 * Get VS Code info
 */
function getVSCodeInfo() {
  return {
    stable: getUserDataDir("code") !== null,
    insiders: getUserDataDir("code-insiders") !== null,
    oss: getUserDataDir("code-oss") !== null,
    hasGitHubAuth: hasGitHubAuth(),
  };
}

/**
 * Copy GitHub auth to test instance
 */
function copyGitHubAuthToTest(targetUserDataDir: string): boolean {
  try {
    const sourceUserDataDir = findUserDataDir();
    if (!sourceUserDataDir) {
      console.log("ℹ️  No VS Code user data directory found.");
      return false;
    }

    const sourceAuthDir = getGitHubAuthStorageDir(sourceUserDataDir);
    if (!fs.existsSync(sourceAuthDir)) {
      console.log("ℹ️  No GitHub authentication found in VS Code profile.");
      return false;
    }

    const targetAuthDir = getGitHubAuthStorageDir(targetUserDataDir);
    fs.mkdirSync(path.dirname(targetAuthDir), { recursive: true });
    fs.cpSync(sourceAuthDir, targetAuthDir, { recursive: true });

    console.log(`✅ Copied GitHub authentication to test instance`);
    console.log(`   Source: ${sourceAuthDir}`);
    console.log(`   Target: ${targetAuthDir}`);

    return true;
  } catch (error) {
    console.warn("⚠️  Failed to copy GitHub authentication:", error instanceof Error ? error.message : error);
    return false;
  }
}

main();
