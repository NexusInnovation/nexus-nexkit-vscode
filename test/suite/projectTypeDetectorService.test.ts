/**
 * Tests for ProjectTypeDetectorService
 * Detects project type (Node.js, .NET, Python) from workspace marker files.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ProjectTypeDetectorService } from "../../src/features/initialization/projectTypeDetectorService";

suite("Unit: ProjectTypeDetectorService", () => {
  let service: ProjectTypeDetectorService;
  let tempDir: string;

  setup(() => {
    service = new ProjectTypeDetectorService();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-project-detect-"));
  });

  teardown(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test("Should instantiate ProjectTypeDetectorService", () => {
    assert.ok(service);
  });

  test("Should detect Node.js project from package.json", async () => {
    fs.writeFileSync(path.join(tempDir, "package.json"), "{}");

    const result = await service.detectProjectType(tempDir);

    assert.strictEqual(result.type, "nodejs");
    assert.ok(result.hints.includes("package.json"));
  });

  test("Should detect Node.js project with high confidence from multiple markers", async () => {
    fs.writeFileSync(path.join(tempDir, "package.json"), "{}");
    fs.writeFileSync(path.join(tempDir, "package-lock.json"), "{}");
    fs.mkdirSync(path.join(tempDir, "node_modules"), { recursive: true });

    const result = await service.detectProjectType(tempDir);

    assert.strictEqual(result.type, "nodejs");
    assert.strictEqual(result.confidence, "high");
    assert.ok(result.hints.length >= 3);
  });

  test("Should detect .NET project from .csproj file", async () => {
    fs.writeFileSync(path.join(tempDir, "MyProject.csproj"), "<Project />");

    const result = await service.detectProjectType(tempDir);

    assert.strictEqual(result.type, "dotnet");
    assert.ok(result.hints.some((h) => h.endsWith(".csproj")));
  });

  test("Should detect .NET project from .sln file", async () => {
    fs.writeFileSync(path.join(tempDir, "MySolution.sln"), "");

    const result = await service.detectProjectType(tempDir);

    assert.strictEqual(result.type, "dotnet");
    assert.ok(result.hints.some((h) => h.endsWith(".sln")));
  });

  test("Should detect Python project from requirements.txt", async () => {
    fs.writeFileSync(path.join(tempDir, "requirements.txt"), "flask==2.0");

    const result = await service.detectProjectType(tempDir);

    assert.strictEqual(result.type, "python");
    assert.ok(result.hints.includes("requirements.txt"));
  });

  test("Should detect Python project from pyproject.toml", async () => {
    fs.writeFileSync(path.join(tempDir, "pyproject.toml"), "[tool.poetry]");

    const result = await service.detectProjectType(tempDir);

    assert.strictEqual(result.type, "python");
    assert.ok(result.hints.includes("pyproject.toml"));
  });

  test("Should return unknown for empty directory", async () => {
    const result = await service.detectProjectType(tempDir);

    assert.strictEqual(result.type, "unknown");
    assert.strictEqual(result.confidence, "low");
    assert.strictEqual(result.hints.length, 0);
  });

  test("Should prefer project type with most markers", async () => {
    // Node.js: 2 markers
    fs.writeFileSync(path.join(tempDir, "package.json"), "{}");
    fs.writeFileSync(path.join(tempDir, "package-lock.json"), "{}");
    // Python: 1 marker
    fs.writeFileSync(path.join(tempDir, "requirements.txt"), "");

    const result = await service.detectProjectType(tempDir);

    assert.strictEqual(result.type, "nodejs");
  });
});
