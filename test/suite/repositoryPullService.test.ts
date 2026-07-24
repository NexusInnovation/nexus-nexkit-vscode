import * as assert from "assert";
import * as childProcess from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import { EventEmitter } from "events";
import { SettingsManager } from "../../src/core/settingsManager";
import { RepositorySyncRepository } from "../../src/features/repository-sync/models/repositorySyncModels";
import { RepositoryPullService } from "../../src/features/repository-sync/services/repositoryPullService";
import { LoggingService } from "../../src/shared/services/loggingService";

interface FakeChildProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
}

function createChild(stdout: string, stderr = "", exitCode = 0): FakeChildProcess {
  const child = new EventEmitter() as FakeChildProcess;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  process.nextTick(() => {
    if (stdout.length > 0) {
      child.stdout.emit("data", Buffer.from(stdout, "utf8"));
    }
    if (stderr.length > 0) {
      child.stderr.emit("data", Buffer.from(stderr, "utf8"));
    }
    child.emit("close", exitCode);
  });

  return child;
}

suite("Unit: RepositoryPullService", () => {
  let sandbox: sinon.SinonSandbox;
  let tempRoot: string;
  let repositoryPath: string;
  let repository: RepositorySyncRepository;
  let service: RepositoryPullService;
  let spawnStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexkit-repo-pull-"));
    repositoryPath = path.join(tempRoot, "repo");
    fs.mkdirSync(path.join(repositoryPath, ".git"), { recursive: true });

    repository = {
      key: "repo",
      name: "Repo",
      path: repositoryPath,
      source: "workspace",
      isExternal: false,
    };

    spawnStub = sandbox.stub(childProcess, "spawn") as unknown as sinon.SinonStub;
    sandbox.stub(SettingsManager, "getRepoSyncAllowedBranches").returns(["main"]);

    service = new RepositoryPullService(sinon.createStubInstance(LoggingService) as unknown as LoggingService);
  });

  teardown(() => {
    sandbox.restore();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test("returns success-ready when fast-forward is available after fetch", async () => {
    const calls: Record<string, () => FakeChildProcess> = {
      "rev-parse --git-dir": () => createChild(".git\n"),
      "status --porcelain": () => createChild(""),
      "rev-parse --abbrev-ref HEAD": () => createChild("main\n"),
      "rev-parse --abbrev-ref --symbolic-full-name @{u}": () => createChild("origin/main\n"),
      "ls-remote --heads origin": () => createChild("hash refs/heads/main\n"),
      "fetch --prune --quiet": () => createChild(""),
      "rev-list --left-right --count HEAD...@{u}": () => createChild("0\t2\n"),
    };

    spawnStub.callsFake((_command: string, args: string[]) => {
      const factory = calls[args.join(" ")];
      return factory ? factory() : createChild("", "error", 1);
    });

    const result = await service.pullRepository(repository);

    assert.strictEqual(result.outcome.kind, "success-ready");
    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.success, true);
  });

  test("returns conflict-risk when local repository is dirty", async () => {
    const calls: Record<string, () => FakeChildProcess> = {
      "status --porcelain": () => createChild(" M src/file.ts\n"),
    };

    spawnStub.callsFake((_command: string, args: string[]) => {
      if (args.join(" ") === "rev-parse --git-dir") {
        return createChild(".git\n");
      }
      const factory = calls[args.join(" ")];
      return factory ? factory() : createChild("", "error", 1);
    });

    const result = await service.pullRepository(repository);

    assert.strictEqual(result.outcome.kind, "conflict-risk");
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.changed, false);
  });

  test("skips when branch is outside allowlist", async () => {
    const calls: Record<string, () => FakeChildProcess> = {
      "status --porcelain": () => createChild(""),
      "rev-parse --abbrev-ref HEAD": () => createChild("feature/test\n"),
    };

    spawnStub.callsFake((_command: string, args: string[]) => {
      if (args.join(" ") === "rev-parse --git-dir") {
        return createChild(".git\n");
      }
      const factory = calls[args.join(" ")];
      return factory ? factory() : createChild("", "error", 1);
    });

    const result = await service.pullRepository(repository);

    assert.strictEqual(result.outcome.kind, "skipped");
    assert.match(result.reason ?? "", /allowed branch/i);
  });
});
