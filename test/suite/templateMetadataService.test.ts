/**
 * Tests for TemplateMetadataService
 * Covers metadata extraction for all template types, with emphasis on the
 * skill-specific SKILL.md lookup path.
 */

import * as assert from "assert";
import * as sinon from "sinon";
import { TemplateMetadataService } from "../../src/features/ai-template-files/services/templateMetadataService";
import { RepositoryManager } from "../../src/features/ai-template-files/services/repositoryManager";
import { AITemplateFile } from "../../src/features/ai-template-files/models/aiTemplateFile";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgentTemplate(overrides: Partial<AITemplateFile> = {}): AITemplateFile {
  return {
    name: "python.agent.md",
    type: "agents",
    rawUrl: "https://raw.githubusercontent.com/org/repo/main/agents/python.agent.md",
    repository: "Test Repo",
    repositoryUrl: "https://github.com/org/repo",
    ...overrides,
  };
}

function makeSkillTemplate(overrides: Partial<AITemplateFile> = {}): AITemplateFile {
  return {
    name: "my-skill",
    type: "skills",
    rawUrl: "",
    repository: "Test Repo",
    repositoryUrl: "https://github.com/org/repo",
    isDirectory: true,
    sourcePath: "skills/my-skill",
    ...overrides,
  };
}

function makeMockProvider(
  downloadTemplateFn: (t: AITemplateFile) => Promise<string>,
  downloadSkillMetadataFileFn: (t: AITemplateFile) => Promise<string | null>
) {
  return {
    downloadTemplate: downloadTemplateFn,
    downloadSkillMetadataFile: downloadSkillMetadataFileFn,
    downloadDirectoryContents: async () => new Map<string, string>(),
    fetchAllTemplates: async () => [],
    getRepositoryName: () => "Test Repo",
    getConfig: () => ({}) as any,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

suite("Unit: TemplateMetadataService", () => {
  let sandbox: sinon.SinonSandbox;
  let mockRepositoryManager: sinon.SinonStubbedInstance<RepositoryManager>;
  let service: TemplateMetadataService;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockRepositoryManager = sandbox.createStubInstance(RepositoryManager);
    service = new TemplateMetadataService(mockRepositoryManager as unknown as RepositoryManager);
  });

  teardown(() => {
    sandbox.restore();
  });

  // -------------------------------------------------------------------------
  // Non-skill templates (agents, prompts, instructions, chatmodes)
  // -------------------------------------------------------------------------

  suite("Non-skill templates", () => {
    test("Should parse name and description from YAML frontmatter", async () => {
      const template = makeAgentTemplate();
      const content = `---\nname: Python Expert\ndescription: Helps write Python code\n---\n# Body`;

      const provider = makeMockProvider(
        async () => content,
        async () => null
      );
      mockRepositoryManager.getProvider.returns(provider as any);

      const metadata = await service.getMetadata(template);

      assert.ok(metadata, "Should return metadata");
      assert.strictEqual(metadata.name, "Python Expert");
      assert.strictEqual(metadata.description, "Helps write Python code");
    });

    test("Should fall back to filename when frontmatter is absent", async () => {
      const template = makeAgentTemplate();
      const content = `# No frontmatter here\nJust body text`;

      const provider = makeMockProvider(
        async () => content,
        async () => null
      );
      mockRepositoryManager.getProvider.returns(provider as any);

      const metadata = await service.getMetadata(template);

      assert.ok(metadata, "Should return metadata");
      assert.strictEqual(metadata.name, "python.agent", "Filename without .md extension");
      assert.strictEqual(metadata.description, "");
    });

    test("Should return null when downloadTemplate throws", async () => {
      const template = makeAgentTemplate();

      const provider = makeMockProvider(
        async () => {
          throw new Error("Network error");
        },
        async () => null
      );
      mockRepositoryManager.getProvider.returns(provider as any);

      const metadata = await service.getMetadata(template);

      assert.strictEqual(metadata, null, "Should return null on fetch error");
    });

    test("Should return null when provider is not found", async () => {
      const template = makeAgentTemplate();
      mockRepositoryManager.getProvider.returns(undefined);

      const metadata = await service.getMetadata(template);

      assert.strictEqual(metadata, null);
    });

    test("Should cache result and not re-fetch on second call", async () => {
      const template = makeAgentTemplate();
      const content = `---\nname: Cached Agent\ndescription: Cached\n---\n`;

      let callCount = 0;
      const provider = makeMockProvider(
        async () => {
          callCount++;
          return content;
        },
        async () => null
      );
      mockRepositoryManager.getProvider.returns(provider as any);

      await service.getMetadata(template);
      await service.getMetadata(template);

      assert.strictEqual(callCount, 1, "downloadTemplate should be called only once due to caching");
    });
  });

  // -------------------------------------------------------------------------
  // Skill templates (directories containing SKILL.md)
  // -------------------------------------------------------------------------

  suite("Skill templates", () => {
    test("Should read metadata from SKILL.md when present", async () => {
      const template = makeSkillTemplate();
      const skillMdContent = `---\nname: My Awesome Skill\ndescription: Does awesome things\n---\n# Overview`;

      const provider = makeMockProvider(
        async () => {
          throw new Error("Should not call downloadTemplate for skills");
        },
        async () => skillMdContent
      );
      mockRepositoryManager.getProvider.returns(provider as any);

      const metadata = await service.getMetadata(template);

      assert.ok(metadata, "Should return metadata");
      assert.strictEqual(metadata.name, "My Awesome Skill");
      assert.strictEqual(metadata.description, "Does awesome things");
    });

    test("Should NOT call downloadTemplate for skill templates", async () => {
      const template = makeSkillTemplate();
      const skillMdContent = `---\nname: My Skill\ndescription: Skill desc\n---\n`;

      let downloadTemplateCalled = false;
      const provider = makeMockProvider(
        async () => {
          downloadTemplateCalled = true;
          return "";
        },
        async () => skillMdContent
      );
      mockRepositoryManager.getProvider.returns(provider as any);

      await service.getMetadata(template);

      assert.strictEqual(downloadTemplateCalled, false, "downloadTemplate must NOT be called for skills");
    });

    test("Should return fallback metadata using folder name when SKILL.md is absent", async () => {
      const template = makeSkillTemplate({ name: "my-special-skill" });

      const provider = makeMockProvider(
        async () => {
          throw new Error("Should not call downloadTemplate for skills");
        },
        async () => null // SKILL.md not found
      );
      mockRepositoryManager.getProvider.returns(provider as any);

      const metadata = await service.getMetadata(template);

      assert.ok(metadata, "Should return fallback metadata");
      assert.strictEqual(metadata.name, "my-special-skill", "Name should be the folder name");
      assert.strictEqual(metadata.description, "");
    });

    test("Should use folder name as display name when SKILL.md has no frontmatter", async () => {
      const template = makeSkillTemplate({ name: "context7" });
      const skillMdContent = `# Context7\nA skill without frontmatter.`;

      const provider = makeMockProvider(
        async () => {
          throw new Error("Should not call downloadTemplate for skills");
        },
        async () => skillMdContent
      );
      mockRepositoryManager.getProvider.returns(provider as any);

      const metadata = await service.getMetadata(template);

      assert.ok(metadata, "Should return metadata");
      // parseMetadata falls back to filename (context7) when no frontmatter
      assert.strictEqual(metadata.name, "context7");
    });

    test("Should return null when downloadSkillMetadataFile throws", async () => {
      const template = makeSkillTemplate();

      const provider = makeMockProvider(
        async () => "",
        async () => {
          throw new Error("Network error");
        }
      );
      mockRepositoryManager.getProvider.returns(provider as any);

      const metadata = await service.getMetadata(template);

      assert.strictEqual(metadata, null, "Should return null on fetch error");
    });

    test("Should cache SKILL.md result and not re-fetch on second call", async () => {
      const template = makeSkillTemplate();
      const skillMdContent = `---\nname: Cached Skill\ndescription: Cached\n---\n`;

      let callCount = 0;
      const provider = makeMockProvider(
        async () => "",
        async () => {
          callCount++;
          return skillMdContent;
        }
      );
      mockRepositoryManager.getProvider.returns(provider as any);

      await service.getMetadata(template);
      await service.getMetadata(template);

      assert.strictEqual(callCount, 1, "downloadSkillMetadataFile should be called only once due to caching");
    });

    test("Should cache fallback metadata (no SKILL.md) without re-fetching", async () => {
      const template = makeSkillTemplate();

      let callCount = 0;
      const provider = makeMockProvider(
        async () => "",
        async () => {
          callCount++;
          return null;
        }
      );
      mockRepositoryManager.getProvider.returns(provider as any);

      await service.getMetadata(template);
      await service.getMetadata(template);

      assert.strictEqual(callCount, 1, "downloadSkillMetadataFile should be called only once even for null result");
    });

    test("Should handle SKILL.md with only description (no name field)", async () => {
      const template = makeSkillTemplate({ name: "infer-name-skill" });
      const skillMdContent = `---\ndescription: A skill with only description\n---\n`;

      const provider = makeMockProvider(
        async () => "",
        async () => skillMdContent
      );
      mockRepositoryManager.getProvider.returns(provider as any);

      const metadata = await service.getMetadata(template);

      assert.ok(metadata, "Should return metadata");
      // No 'name' in frontmatter → falls back to folder name (without .md since no extension)
      assert.strictEqual(metadata.name, "infer-name-skill", "Should use folder name as fallback");
      assert.strictEqual(metadata.description, "A skill with only description");
    });
  });

  // -------------------------------------------------------------------------
  // clearCache
  // -------------------------------------------------------------------------

  suite("Cache management", () => {
    test("Should re-fetch after clearCache is called", async () => {
      const template = makeSkillTemplate();
      const skillMdContent = `---\nname: Refreshed Skill\ndescription: New content\n---\n`;

      let callCount = 0;
      const provider = makeMockProvider(
        async () => "",
        async () => {
          callCount++;
          return skillMdContent;
        }
      );
      mockRepositoryManager.getProvider.returns(provider as any);

      await service.getMetadata(template);
      service.clearCache();
      await service.getMetadata(template);

      assert.strictEqual(callCount, 2, "Should re-fetch after cache is cleared");
    });
  });
});
