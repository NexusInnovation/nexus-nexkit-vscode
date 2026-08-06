/**
 * Tests for DevOps URL Parser
 */

import * as assert from "assert";
import { parseDevOpsUrl, generateConnectionId, parseAzureReposGitRemoteUrl } from "../../src/features/apm-devops/devOpsUrlParser";

suite("Unit: DevOps URL Parser", () => {
  suite("parseDevOpsUrl", () => {
    // Valid URL formats
    suite("Valid URLs", () => {
      test("Should parse dev.azure.com URL with org and project", () => {
        const result = parseDevOpsUrl("https://dev.azure.com/librairie-martin/SLIM");

        assert.strictEqual(result.isValid, true);
        assert.strictEqual(result.organization, "librairie-martin");
        assert.strictEqual(result.project, "SLIM");
        assert.strictEqual(result.error, undefined);
      });

      test("Should parse dev.azure.com URL with trailing slash", () => {
        const result = parseDevOpsUrl("https://dev.azure.com/myorg/myproject/");

        assert.strictEqual(result.isValid, true);
        assert.strictEqual(result.organization, "myorg");
        assert.strictEqual(result.project, "myproject");
      });

      test("Should parse dev.azure.com URL with workitems path", () => {
        const result = parseDevOpsUrl("https://dev.azure.com/myorg/myproject/_workitems");

        assert.strictEqual(result.isValid, true);
        assert.strictEqual(result.organization, "myorg");
        assert.strictEqual(result.project, "myproject");
      });

      test("Should parse dev.azure.com URL with git path", () => {
        const result = parseDevOpsUrl("https://dev.azure.com/myorg/myproject/_git/repo");

        assert.strictEqual(result.isValid, true);
        assert.strictEqual(result.organization, "myorg");
        assert.strictEqual(result.project, "myproject");
      });

      test("Should parse visualstudio.com URL", () => {
        const result = parseDevOpsUrl("https://myorg.visualstudio.com/MyProject");

        assert.strictEqual(result.isValid, true);
        assert.strictEqual(result.organization, "myorg");
        assert.strictEqual(result.project, "MyProject");
      });

      test("Should parse visualstudio.com URL with DefaultCollection", () => {
        const result = parseDevOpsUrl("https://myorg.visualstudio.com/DefaultCollection/MyProject");

        assert.strictEqual(result.isValid, true);
        assert.strictEqual(result.organization, "myorg");
        assert.strictEqual(result.project, "MyProject");
      });

      test("Should handle URL-encoded characters in project name", () => {
        const result = parseDevOpsUrl("https://dev.azure.com/myorg/My%20Project");

        assert.strictEqual(result.isValid, true);
        assert.strictEqual(result.organization, "myorg");
        assert.strictEqual(result.project, "My Project");
      });

      test("Should accept HTTP URLs", () => {
        const result = parseDevOpsUrl("http://dev.azure.com/myorg/myproject");

        assert.strictEqual(result.isValid, true);
        assert.strictEqual(result.organization, "myorg");
        assert.strictEqual(result.project, "myproject");
      });
    });

    // Invalid URL formats
    suite("Invalid URLs", () => {
      test("Should reject empty string", () => {
        const result = parseDevOpsUrl("");

        assert.strictEqual(result.isValid, false);
        assert.ok(result.error);
      });

      test("Should reject null/undefined", () => {
        const result = parseDevOpsUrl(null as any);

        assert.strictEqual(result.isValid, false);
        assert.ok(result.error);
      });

      test("Should reject whitespace-only string", () => {
        const result = parseDevOpsUrl("   ");

        assert.strictEqual(result.isValid, false);
        assert.ok(result.error);
      });

      test("Should reject non-URL string", () => {
        const result = parseDevOpsUrl("not a url");

        assert.strictEqual(result.isValid, false);
        assert.ok(result.error?.includes("Invalid URL"));
      });

      test("Should reject non-Azure DevOps URL", () => {
        const result = parseDevOpsUrl("https://github.com/myorg/myproject");

        assert.strictEqual(result.isValid, false);
        assert.ok(result.error?.includes("Azure DevOps"));
      });

      test("Should reject dev.azure.com URL without project", () => {
        const result = parseDevOpsUrl("https://dev.azure.com/myorg");

        assert.strictEqual(result.isValid, false);
        assert.ok(result.error?.includes("project"));
      });

      test("Should reject visualstudio.com URL without project", () => {
        const result = parseDevOpsUrl("https://myorg.visualstudio.com/");

        assert.strictEqual(result.isValid, false);
        assert.ok(result.error?.includes("project"));
      });

      test("Should reject URL with only reserved path", () => {
        const result = parseDevOpsUrl("https://dev.azure.com/myorg/_apis");

        assert.strictEqual(result.isValid, false);
        assert.ok(result.error);
      });

      test("Should reject FTP protocol", () => {
        const result = parseDevOpsUrl("ftp://dev.azure.com/myorg/myproject");

        assert.strictEqual(result.isValid, false);
        assert.ok(result.error?.includes("HTTP"));
      });
    });
  });

  suite("generateConnectionId", () => {
    test("Should generate connection ID from org and project", () => {
      const result = generateConnectionId("librairie-martin", "SLIM");

      assert.strictEqual(result, "librairie-martin-slim");
    });

    test("Should lowercase the connection ID", () => {
      const result = generateConnectionId("MyOrg", "MyProject");

      assert.strictEqual(result, "myorg-myproject");
    });
  });

  suite("parseAzureReposGitRemoteUrl", () => {
    test("Should parse dev.azure.com https git remote", () => {
      const result = parseAzureReposGitRemoteUrl("https://dev.azure.com/myorg/myproject/_git/myrepo");

      assert.strictEqual(result.isAzureRepos, true);
      assert.strictEqual(result.organization, "myorg");
      assert.strictEqual(result.project, "myproject");
      assert.strictEqual(result.repository, "myrepo");
    });

    test("Should parse dev.azure.com https git remote with org@ prefix", () => {
      const result = parseAzureReposGitRemoteUrl("https://myorg@dev.azure.com/myorg/myproject/_git/myrepo");

      assert.strictEqual(result.isAzureRepos, true);
      assert.strictEqual(result.organization, "myorg");
      assert.strictEqual(result.project, "myproject");
      assert.strictEqual(result.repository, "myrepo");
    });

    test("Should parse dev.azure.com SSH git remote", () => {
      const result = parseAzureReposGitRemoteUrl("git@ssh.dev.azure.com:v3/myorg/myproject/myrepo");

      assert.strictEqual(result.isAzureRepos, true);
      assert.strictEqual(result.organization, "myorg");
      assert.strictEqual(result.project, "myproject");
      assert.strictEqual(result.repository, "myrepo");
    });

    test("Should parse legacy visualstudio.com https git remote", () => {
      const result = parseAzureReposGitRemoteUrl("https://myorg.visualstudio.com/myproject/_git/myrepo");

      assert.strictEqual(result.isAzureRepos, true);
      assert.strictEqual(result.organization, "myorg");
      assert.strictEqual(result.project, "myproject");
      assert.strictEqual(result.repository, "myrepo");
    });

    test("Should parse legacy visualstudio.com https git remote with DefaultCollection", () => {
      const result = parseAzureReposGitRemoteUrl("https://myorg.visualstudio.com/DefaultCollection/myproject/_git/myrepo");

      assert.strictEqual(result.isAzureRepos, true);
      assert.strictEqual(result.organization, "myorg");
      assert.strictEqual(result.project, "myproject");
      assert.strictEqual(result.repository, "myrepo");
    });

    test("Should parse legacy vs-ssh.visualstudio.com SSH git remote", () => {
      const result = parseAzureReposGitRemoteUrl("myorg@vs-ssh.visualstudio.com:v3/myorg/myproject/myrepo");

      assert.strictEqual(result.isAzureRepos, true);
      assert.strictEqual(result.organization, "myorg");
      assert.strictEqual(result.project, "myproject");
      assert.strictEqual(result.repository, "myrepo");
    });

    test("Should return isAzureRepos false for GitHub URL", () => {
      const result = parseAzureReposGitRemoteUrl("https://github.com/myorg/myrepo.git");

      assert.strictEqual(result.isAzureRepos, false);
      assert.strictEqual(result.organization, undefined);
    });

    test("Should return isAzureRepos false for GitHub SSH URL", () => {
      const result = parseAzureReposGitRemoteUrl("git@github.com:myorg/myrepo.git");

      assert.strictEqual(result.isAzureRepos, false);
    });

    test("Should return isAzureRepos false for empty/invalid input", () => {
      assert.strictEqual(parseAzureReposGitRemoteUrl("").isAzureRepos, false);
      assert.strictEqual(parseAzureReposGitRemoteUrl(null as any).isAzureRepos, false);
      assert.strictEqual(parseAzureReposGitRemoteUrl("not a url").isAzureRepos, false);
    });
  });
});
