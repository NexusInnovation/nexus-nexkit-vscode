import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {
  CHAT_OPEN_COMMAND,
  SQUAD_CHAT_AGENT_MODE,
  SquadCeremonyService,
} from "../../src/features/squad/services/squadCeremonyService";
import { SQUAD_CEREMONIES_RELATIVE_PATH, squadErr, squadOk } from "../../src/features/squad/models";

function createFileService(ceremonies = [{ id: "standup", name: "Standup", enabled: true, agenda: ["Sync"] }]) {
  return {
    readCeremonies: sinon.stub().resolves(
      squadOk({
        relativePath: SQUAD_CEREMONIES_RELATIVE_PATH,
        exists: true,
        ceremonies,
        truncated: false,
      })
    ),
  };
}

suite("Unit: SquadCeremonyService (SQD-047)", () => {
  test("listCeremonies delegates to SquadFileService", async () => {
    const fileService = createFileService();
    const service = new SquadCeremonyService(vscode.Uri.file("C:\\workspace"), fileService as never);

    const result = await service.listCeremonies();

    assert.strictEqual(result.ok, true);
    sinon.assert.calledOnce(fileService.readCeremonies);
  });

  test("runCeremony re-reads the file and opens Copilot Chat for an enabled ceremony", async () => {
    const fileService = createFileService();
    const execute = sinon.stub().resolves(undefined);
    const service = new SquadCeremonyService(vscode.Uri.file("C:\\workspace"), fileService as never, execute);

    const result = await service.runCeremony("standup");

    assert.strictEqual(result.ok, true);
    sinon.assert.calledOnce(fileService.readCeremonies);
    sinon.assert.calledOnce(execute);
    assert.strictEqual(execute.firstCall.args[0], CHAT_OPEN_COMMAND);
    assert.strictEqual(execute.firstCall.args[1].mode, SQUAD_CHAT_AGENT_MODE);
    assert.ok(String(execute.firstCall.args[1].query).includes('Run the "Standup" ceremony'));
  });

  test("runCeremony rejects stale, missing or disabled ceremonies without opening chat", async () => {
    const fileService = createFileService([{ id: "retro", name: "Retro", enabled: false, agenda: [] }]);
    const execute = sinon.stub().resolves(undefined);
    const service = new SquadCeremonyService(vscode.Uri.file("C:\\workspace"), fileService as never, execute);

    const stale = await service.runCeremony("missing");
    const disabled = await service.runCeremony("retro");

    assert.strictEqual(stale.ok, false);
    assert.strictEqual(stale.ok ? undefined : stale.error.code, "invalid-input");
    assert.strictEqual(disabled.ok, false);
    assert.strictEqual(disabled.ok ? undefined : disabled.error.message, 'The "Retro" ceremony is disabled.');
    sinon.assert.notCalled(execute);
  });

  test("runCeremony surfaces chat launch failures as actionable errors", async () => {
    const fileService = createFileService();
    const execute = sinon.stub().rejects(new Error("chat unavailable"));
    const service = new SquadCeremonyService(vscode.Uri.file("C:\\workspace"), fileService as never, execute);

    const result = await service.runCeremony("standup");

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.ok ? undefined : result.error.code, "ceremony-failed");
    assert.ok(result.ok ? false : result.error.remediation?.includes("Copilot Chat"));
  });

  test("openCeremoniesFile opens the workspace-relative ceremonies file", async () => {
    const execute = sinon.stub().resolves(undefined);
    const service = new SquadCeremonyService(vscode.Uri.file("C:\\workspace"), createFileService() as never, execute);

    const result = await service.openCeremoniesFile();

    assert.strictEqual(result.ok, true);
    sinon.assert.calledOnce(execute);
    assert.strictEqual(execute.firstCall.args[0], "vscode.open");
    assert.ok(String((execute.firstCall.args[1] as vscode.Uri).fsPath).endsWith(".squad\\ceremonies.md"));
  });

  test("returns not-a-workspace when no file service or workspace is available", async () => {
    const service = new SquadCeremonyService(undefined, undefined);

    const list = await service.listCeremonies();
    const open = await service.openCeremoniesFile();

    assert.strictEqual(list.ok, false);
    assert.strictEqual(list.ok ? undefined : list.error.code, "not-a-workspace");
    assert.strictEqual(open.ok, false);
    assert.strictEqual(open.ok ? undefined : open.error.code, "not-a-workspace");
  });

  test("propagates file-service read errors instead of returning success", async () => {
    const fileService = {
      readCeremonies: sinon.stub().resolves(squadErr({ code: "file-read-failed", message: "Cannot read ceremonies." })),
    };
    const service = new SquadCeremonyService(vscode.Uri.file("C:\\workspace"), fileService as never);

    const result = await service.runCeremony("standup");

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.ok ? undefined : result.error.message, "Cannot read ceremonies.");
  });
});
