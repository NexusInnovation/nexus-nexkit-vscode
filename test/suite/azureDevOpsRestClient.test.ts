/**
 * Tests for AzureDevOpsRestClient
 * Mocks global fetch via sinon; never makes real network calls.
 */

import * as assert from "assert";
import * as sinon from "sinon";
import { AzureDevOpsRestClient } from "../../src/features/devops-branch-creation/azureDevOpsRestClient";
import { AzureDevOpsAuthService } from "../../src/features/devops-branch-creation/azureDevOpsAuthService";

function fakeResponse(status: number, body: unknown, statusText = ""): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  } as unknown as Response;
}

suite("Unit: AzureDevOpsRestClient", () => {
  let sandbox: sinon.SinonSandbox;
  let fetchStub: sinon.SinonStub;
  let originalFetch: typeof fetch;
  let client: AzureDevOpsRestClient;
  let getAccessTokenStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    originalFetch = globalThis.fetch;
    fetchStub = sandbox.stub();
    (globalThis as any).fetch = fetchStub;

    const authService = new AzureDevOpsAuthService();
    getAccessTokenStub = sandbox.stub(authService, "getAccessToken").resolves("fake-token");
    client = new AzureDevOpsRestClient(authService);
  });

  teardown(() => {
    sandbox.restore();
    (globalThis as any).fetch = originalFetch;
  });

  test("Should return the mapped work item on a 200 response", async () => {
    fetchStub.resolves(
      fakeResponse(200, {
        id: 1234,
        fields: {
          "System.Title": "Fix the login button",
          "System.WorkItemType": "Bug",
        },
      })
    );

    const result = await client.getWorkItem("myorg", 1234);

    assert.deepStrictEqual(result, {
      id: 1234,
      title: "Fix the login button",
      type: "Bug",
      organization: "myorg",
    });
    assert.ok(getAccessTokenStub.calledOnce);
    const [, options] = fetchStub.firstCall.args;
    assert.strictEqual(options.headers.Authorization, "Bearer fake-token");
    assert.strictEqual(options.headers.Accept, "application/json");
    assert.ok(options.headers["User-Agent"].startsWith("nexus-nexkit-vscode/"));
  });

  test("Should throw a clear error on 401", async () => {
    fetchStub.resolves(fakeResponse(401, {}, "Unauthorized"));

    await assert.rejects(() => client.getWorkItem("myorg", 1), /Entra ID/);
  });

  test("Should throw a clear error on 403", async () => {
    fetchStub.resolves(fakeResponse(403, {}, "Forbidden"));

    await assert.rejects(() => client.getWorkItem("myorg", 1), /Entra ID/);
  });

  test("Should throw a clear error on 404", async () => {
    fetchStub.resolves(fakeResponse(404, {}, "Not Found"));

    await assert.rejects(() => client.getWorkItem("myorg", 999), /introuvable/);
  });

  test("Should throw a clear error on 429", async () => {
    fetchStub.resolves(fakeResponse(429, {}, "Too Many Requests"));

    await assert.rejects(() => client.getWorkItem("myorg", 1), /Limite de requêtes/);
  });

  test("Should throw a generic error on other non-ok statuses", async () => {
    fetchStub.resolves(fakeResponse(500, {}, "Internal Server Error"));

    await assert.rejects(() => client.getWorkItem("myorg", 1), /Erreur Azure DevOps \(500/);
  });

  test("Should throw a clear error when required fields are missing", async () => {
    fetchStub.resolves(fakeResponse(200, { id: 1234, fields: {} }));

    await assert.rejects(() => client.getWorkItem("myorg", 1234), /incomplète/);
  });

  test("Should throw a clear error when the network call itself fails", async () => {
    fetchStub.rejects(new Error("network down"));

    await assert.rejects(() => client.getWorkItem("myorg", 1), /Impossible de contacter Azure DevOps/);
  });
});
