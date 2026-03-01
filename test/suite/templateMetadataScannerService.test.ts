/**
 * Tests for TemplateMetadataScannerService
 * Background metadata scanner for fuzzy search
 */

import * as assert from "assert";
import * as sinon from "sinon";
import {
  TemplateMetadataScannerService,
  TemplateMetadataEntry,
  MetadataScanProgress,
} from "../../src/features/ai-template-files/services/templateMetadataScannerService";
import { TemplateMetadataService } from "../../src/features/ai-template-files/services/templateMetadataService";
import { AITemplateDataService } from "../../src/features/ai-template-files/services/aiTemplateDataService";
import { AITemplateFile } from "../../src/features/ai-template-files/models/aiTemplateFile";

suite("Unit: TemplateMetadataScannerService", () => {
  let scanner: TemplateMetadataScannerService;
  let mockMetadataService: sinon.SinonStubbedInstance<TemplateMetadataService>;
  let mockTemplateDataService: sinon.SinonStubbedInstance<AITemplateDataService>;

  const mockTemplates: AITemplateFile[] = [
    {
      name: "python-agent.md",
      type: "agents",
      rawUrl: "https://example.com/agents/python-agent.md",
      repository: "test-repo",
      repositoryUrl: "https://github.com/test/repo",
    },
    {
      name: "react-prompt.md",
      type: "prompts",
      rawUrl: "https://example.com/prompts/react-prompt.md",
      repository: "test-repo",
      repositoryUrl: "https://github.com/test/repo",
    },
    {
      name: "terraform-skill",
      type: "skills",
      rawUrl: "https://example.com/skills/terraform-skill",
      repository: "test-repo",
      repositoryUrl: "https://github.com/test/repo",
      isDirectory: true,
    },
  ];

  setup(() => {
    mockMetadataService = sinon.createStubInstance(TemplateMetadataService);
    mockTemplateDataService = sinon.createStubInstance(AITemplateDataService);

    scanner = new TemplateMetadataScannerService(
      mockMetadataService as unknown as TemplateMetadataService,
      mockTemplateDataService as unknown as AITemplateDataService
    );
  });

  teardown(() => {
    scanner.dispose();
    sinon.restore();
  });

  test("Should instantiate TemplateMetadataScannerService", () => {
    assert.ok(scanner);
  });

  test("Should not be complete before scan starts", () => {
    assert.strictEqual(scanner.isScanComplete(), false);
  });

  test("Should have empty index before scan starts", () => {
    const index = scanner.getIndex();
    assert.strictEqual(index.length, 0);
  });

  test("Should return initial progress before scan starts", () => {
    const progress = scanner.getProgress();
    assert.strictEqual(progress.isScanning, false);
    assert.strictEqual(progress.scannedCount, 0);
    assert.strictEqual(progress.totalCount, 0);
  });

  test("Should complete scan with empty templates", async () => {
    mockTemplateDataService.getAllTemplates.returns([]);

    let progressEvents: MetadataScanProgress[] = [];
    scanner.onScanProgressChanged((p) => progressEvents.push(p));

    let completedIndex: TemplateMetadataEntry[] | undefined;
    scanner.onScanComplete((idx) => {
      completedIndex = idx;
    });

    await scanner.startScan();

    assert.strictEqual(scanner.isScanComplete(), true);
    assert.ok(completedIndex);
    assert.strictEqual(completedIndex!.length, 0);
  });

  test("Should scan all templates and build index", async () => {
    mockTemplateDataService.getAllTemplates.returns(mockTemplates as any);

    mockMetadataService.getMetadata.withArgs(mockTemplates[0] as any).resolves({
      name: "Python Agent",
      description: "A Python coding assistant",
    });
    mockMetadataService.getMetadata.withArgs(mockTemplates[1] as any).resolves({
      name: "React Prompt",
      description: "Generate React components",
    });
    mockMetadataService.getMetadata.withArgs(mockTemplates[2] as any).resolves({
      name: "Terraform Skill",
      description: "Infrastructure as Code",
    });

    let completedIndex: TemplateMetadataEntry[] | undefined;
    scanner.onScanComplete((idx) => {
      completedIndex = idx;
    });

    await scanner.startScan();

    assert.strictEqual(scanner.isScanComplete(), true);
    assert.ok(completedIndex);
    assert.strictEqual(completedIndex!.length, 3);

    // Verify index entries
    const pythonEntry = completedIndex!.find((e) => e.key === "test-repo::agents::python-agent.md");
    assert.ok(pythonEntry);
    assert.strictEqual(pythonEntry!.name, "Python Agent");
    assert.strictEqual(pythonEntry!.description, "A Python coding assistant");

    const reactEntry = completedIndex!.find((e) => e.key === "test-repo::prompts::react-prompt.md");
    assert.ok(reactEntry);
    assert.strictEqual(reactEntry!.name, "React Prompt");
  });

  test("Should handle metadata fetch failures gracefully", async () => {
    mockTemplateDataService.getAllTemplates.returns(mockTemplates as any);

    mockMetadataService.getMetadata.withArgs(mockTemplates[0] as any).resolves({
      name: "Python Agent",
      description: "A Python coding assistant",
    });
    // Second template throws an error
    mockMetadataService.getMetadata.withArgs(mockTemplates[1] as any).rejects(new Error("Network error"));
    // Third template returns null
    mockMetadataService.getMetadata.withArgs(mockTemplates[2] as any).resolves(null);

    let completedIndex: TemplateMetadataEntry[] | undefined;
    scanner.onScanComplete((idx) => {
      completedIndex = idx;
    });

    await scanner.startScan();

    assert.strictEqual(scanner.isScanComplete(), true);
    assert.ok(completedIndex);
    // Only the first template should be in the index (second failed, third returned null)
    assert.strictEqual(completedIndex!.length, 1);
    assert.strictEqual(completedIndex![0].name, "Python Agent");
  });

  test("Should fire progress events during scan", async () => {
    mockTemplateDataService.getAllTemplates.returns(mockTemplates as any);

    mockMetadataService.getMetadata.resolves({
      name: "Test",
      description: "Test description",
    });

    let progressEvents: MetadataScanProgress[] = [];
    scanner.onScanProgressChanged((p) => progressEvents.push({ ...p }));

    await scanner.startScan();

    // Should have at least: started + batch progress + completed
    assert.ok(progressEvents.length >= 2, `Expected at least 2 progress events, got ${progressEvents.length}`);

    // First event should show scanning started
    assert.strictEqual(progressEvents[0].isScanning, true);
    assert.strictEqual(progressEvents[0].totalCount, mockTemplates.length);

    // Last event should show scanning completed
    const lastEvent = progressEvents[progressEvents.length - 1];
    assert.strictEqual(lastEvent.isScanning, false);
  });

  test("Should have event emitters", () => {
    assert.ok(scanner.onScanProgressChanged);
    assert.ok(scanner.onScanComplete);
  });
});
