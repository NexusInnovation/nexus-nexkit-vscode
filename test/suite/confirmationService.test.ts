/**
 * Tests for ConfirmationService
 * Verifies the three-choice confirmation dialog (Accept / Refuse / Refuse Forever)
 * and that workspaceState is properly consulted and updated.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { ConfirmationService } from "../../src/shared/services/confirmationService";
import { SettingsManager } from "../../src/core/settingsManager";

suite("Unit: ConfirmationService", () => {
  let service: ConfirmationService;
  let sandbox: sinon.SinonSandbox;
  let showInfoStub: sinon.SinonStub;
  let isRefusedForeverStub: sinon.SinonStub;
  let setRefusedForeverStub: sinon.SinonStub;

  const TEST_KEY = "nexkit.confirm.test.refused";
  const TEST_MESSAGE = "Nexkit wants to do something";
  const TEST_DETAIL = "This will change your configuration.";

  setup(() => {
    sandbox = sinon.createSandbox();
    service = new ConfirmationService();

    showInfoStub = sandbox.stub(vscode.window, "showInformationMessage");
    isRefusedForeverStub = sandbox.stub(SettingsManager, "isConfirmationRefusedForever").returns(false);
    setRefusedForeverStub = sandbox.stub(SettingsManager, "setConfirmationRefusedForever").resolves();
  });

  teardown(() => {
    sandbox.restore();
  });

  test("Should instantiate ConfirmationService", () => {
    assert.ok(service);
  });

  // --- Accepted ---

  test("Should return 'accepted' when user clicks Accept", async () => {
    showInfoStub.resolves("Accept");

    const result = await service.confirm(TEST_MESSAGE, TEST_DETAIL, TEST_KEY);

    assert.strictEqual(result, "accepted");
    assert.ok(showInfoStub.calledOnce, "Dialog should be shown once");
    assert.ok(setRefusedForeverStub.notCalled, "Should not persist state for Accept");
  });

  test("Should return 'accepted' when user dismisses the dialog (ESC)", async () => {
    // showInformationMessage resolves undefined when dismissed without choosing
    showInfoStub.resolves(undefined);

    const result = await service.confirm(TEST_MESSAGE, TEST_DETAIL, TEST_KEY);

    assert.strictEqual(result, "accepted");
  });

  // --- Refused ---

  test("Should return 'refused' when user clicks Refuse", async () => {
    showInfoStub.resolves("Refuse");

    const result = await service.confirm(TEST_MESSAGE, TEST_DETAIL, TEST_KEY);

    assert.strictEqual(result, "refused");
    assert.ok(setRefusedForeverStub.notCalled, "Should not persist state for Refuse");
  });

  // --- Refused Forever ---

  test("Should return 'refused-forever' and persist state when user clicks Refuse Forever", async () => {
    showInfoStub.resolves("Refuse Forever (this workspace)");

    const result = await service.confirm(TEST_MESSAGE, TEST_DETAIL, TEST_KEY);

    assert.strictEqual(result, "refused-forever");
    assert.ok(setRefusedForeverStub.calledOnceWith(TEST_KEY, true), "Should persist refused-forever flag");
  });

  test("Should return 'refused-forever' immediately without showing dialog when already refused", async () => {
    isRefusedForeverStub.returns(true);

    const result = await service.confirm(TEST_MESSAGE, TEST_DETAIL, TEST_KEY);

    assert.strictEqual(result, "refused-forever");
    assert.ok(showInfoStub.notCalled, "Dialog should NOT be shown when already refused forever");
  });

  // --- Dialog content ---

  test("Should show a modal dialog with correct message, detail and three choices", async () => {
    showInfoStub.resolves("Accept");

    await service.confirm(TEST_MESSAGE, TEST_DETAIL, TEST_KEY);

    assert.ok(showInfoStub.calledOnce);
    const [msg, options, ...buttons] = showInfoStub.firstCall.args;
    assert.strictEqual(msg, TEST_MESSAGE);
    assert.deepStrictEqual(options, { detail: TEST_DETAIL, modal: true });
    assert.deepStrictEqual(buttons, ["Accept", "Refuse", "Refuse Forever (this workspace)"]);
  });

  // --- Key isolation ---

  test("Should use the provided workspaceStateKey for each call", async () => {
    const keyA = "nexkit.confirm.a.refused";
    const keyB = "nexkit.confirm.b.refused";

    isRefusedForeverStub.withArgs(keyA).returns(true);
    isRefusedForeverStub.withArgs(keyB).returns(false);
    showInfoStub.resolves("Refuse");

    const resultA = await service.confirm(TEST_MESSAGE, TEST_DETAIL, keyA);
    const resultB = await service.confirm(TEST_MESSAGE, TEST_DETAIL, keyB);

    assert.strictEqual(resultA, "refused-forever");
    assert.strictEqual(resultB, "refused");
  });
});
