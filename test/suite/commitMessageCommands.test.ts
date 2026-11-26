import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { ServiceContainer } from "../../src/core/serviceContainer";
import { registerGenerateCommitMessageCommand } from "../../src/features/commit-management/commands";
import { Commands } from "../../src/shared/constants/commands";

suite("Unit: Generate Commit Message Command", () => {
  test("forwards the invoking SCM root URI to the commit message service", async () => {
    const generateCommitMessage = sinon.stub().resolves();
    const telemetry = {
      trackCommandExecution: async (_commandId: string, callback: () => Promise<void>): Promise<void> => callback(),
    };
    const context = { subscriptions: [] as vscode.Disposable[] } as vscode.ExtensionContext;
    const services = {
      commitMessage: { generateCommitMessage },
      telemetry,
    } as unknown as ServiceContainer;
    const rootUri = vscode.Uri.file("/workspace/selected");

    registerGenerateCommitMessageCommand(context, services);
    await vscode.commands.executeCommand(Commands.GENERATE_COMMIT_MESSAGE, { rootUri } as vscode.SourceControl);

    assert.ok(generateCommitMessage.calledOnceWith(rootUri));
    context.subscriptions.forEach((disposable) => disposable.dispose());
  });
});