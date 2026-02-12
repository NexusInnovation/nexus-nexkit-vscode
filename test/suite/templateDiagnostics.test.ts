import * as assert from "assert";
import { getApmAgentDiagnostics } from "../../src/features/panel-ui/utils/templateDiagnostics";
import { OperationMode, RepositoryTemplatesMap } from "../../src/features/ai-template-files/models/aiTemplateFile";

function repo(
  name: string,
  modes: OperationMode[] | undefined,
  agents: number
): RepositoryTemplatesMap {
  const createTemplates = (count: number) => Array.from({ length: count }, (_, i) => ({
    name: `t${i}.md`,
    type: "agents" as const,
    rawUrl: "https://example.invalid",
    repository: name,
    repositoryUrl: "https://example.invalid",
  }));

  return {
    name,
    modes,
    types: {
      agents: createTemplates(agents),
      prompts: [],
      skills: [],
      instructions: [],
      chatmodes: [],
    },
  };
}

suite("Unit: templateDiagnostics", () => {
  test("Should treat only APM-opted-in repos as APM visible", () => {
    const repositories: RepositoryTemplatesMap[] = [
      repo("NoModes", undefined, 10),
      repo("DevOnly", [OperationMode.Developers], 10),
      repo("ApmRepo", [OperationMode.APM], 0),
    ];

    const diag = getApmAgentDiagnostics(repositories);

    assert.strictEqual(diag.apmRepositoryCount, 1);
    assert.strictEqual(diag.apmAgentCount, 0);
    assert.strictEqual(diag.apmRepositories[0].name, "ApmRepo");
  });

  test("Should aggregate agents across APM repositories", () => {
    const repositories: RepositoryTemplatesMap[] = [
      repo("Apm1", [OperationMode.APM], 2),
      repo("Apm2", [OperationMode.APM], 3),
    ];

    const diag = getApmAgentDiagnostics(repositories);

    assert.strictEqual(diag.apmRepositoryCount, 2);
    assert.strictEqual(diag.apmAgentCount, 5);
  });

  test("Should return zero when no APM repositories exist", () => {
    const repositories: RepositoryTemplatesMap[] = [repo("DevOnly", [OperationMode.Developers], 10)];

    const diag = getApmAgentDiagnostics(repositories);

    assert.strictEqual(diag.apmRepositoryCount, 0);
    assert.strictEqual(diag.apmAgentCount, 0);
    assert.deepStrictEqual(diag.apmRepositories, []);
  });
});
