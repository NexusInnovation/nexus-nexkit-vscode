import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import { GitHooksService } from '../../../../src/features/git-hooks-management/services/GitHooksService';
import { RulesManager } from '../../../../src/features/git-hooks-management/services/RulesManager';
import { GitHooksRuleset } from '../../../../src/features/git-hooks-management/types';
import { GitHubAuthHelper } from '../../../../src/shared/utils/githubAuthHelper';

suite('Unit: GitHooksService', () => {
    let sandbox: sinon.SinonSandbox;
    let service: GitHooksService;
    const workspaceRoot = 'c:\\git\\nexkit\\nexus-nexkit-vscode';

    setup(() => {
        sandbox = sinon.createSandbox();
        service = new GitHooksService();
        sandbox.stub(vscode.window, 'showInformationMessage');
        sandbox.stub(vscode.window, 'showErrorMessage');
        sandbox.stub(vscode.workspace, 'workspaceFile').value(undefined);
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([
            {
                uri: vscode.Uri.file(workspaceRoot),
                name: 'nexus-nexkit-vscode',
                index: 0,
            },
        ]);
    });

    teardown(() => {
        sandbox.restore();
    });

    test('syncWithGitHub should fallback to GitHub rulesets and save mapped supported rules from ruleset details', async () => {
        const saveRulesetStub = sandbox.stub(RulesManager.prototype, 'saveRuleset').resolves();
        const gitCommandsWithOptions: Array<{ command: string; options?: childProcess.ExecSyncOptions }> = [];

        sandbox.stub(childProcess, 'execSync').callsFake((command: string, options?: childProcess.ExecSyncOptions) => {
            gitCommandsWithOptions.push({ command, options });

            if (command.startsWith('git symbolic-ref refs/remotes/origin/HEAD')) {
                return 'refs/remotes/origin/main\n';
            }

            if (command.startsWith('git show origin/main:githooks-rulesets.json')) {
                throw new Error('fatal: path \'githooks-rulesets.json\' does not exist in \'origin/main\'');
            }

            if (command.startsWith('git config --get remote.origin.url')) {
                return 'https://github.com/NexusInnovation/nexus-nexkit-vscode.git\n';
            }

            throw new Error(`Unexpected command: ${command}`);
        });

        sandbox
            .stub(GitHubAuthHelper, 'getAuthHeaders')
            .resolves({ 'User-Agent': 'Nexkit-VSCode-Extension', Authorization: 'token test-token' });

        const fetchStub = sandbox.stub(globalThis, 'fetch').callsFake(async (url: string | URL | Request) => {
            const requestUrl = String(url);

            if (requestUrl === 'https://api.github.com/repos/NexusInnovation/nexus-nexkit-vscode/rulesets') {
                return {
                    ok: true,
                    status: 200,
                    json: async () => [{ id: 10 }, { id: 20 }],
                    text: async () => '',
                } as Response;
            }

            if (requestUrl === 'https://api.github.com/repos/NexusInnovation/nexus-nexkit-vscode/rulesets/10') {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        rules: [
                            {
                                type: 'commit_message_pattern',
                                parameters: {
                                    operator: 'regex',
                                    pattern: '^NEX-[0-9]+',
                                },
                            },
                            {
                                type: 'pull_request',
                                parameters: {
                                    dismiss_stale_reviews_on_push: true,
                                },
                            },
                        ],
                    }),
                    text: async () => '',
                } as Response;
            }

            if (requestUrl === 'https://api.github.com/repos/NexusInnovation/nexus-nexkit-vscode/rulesets/20') {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        rules: [
                            {
                                type: 'branch_name_pattern',
                                parameters: {
                                    operator: 'starts_with',
                                    pattern: 'feature/',
                                    negate: false,
                                },
                            },
                            {
                                type: 'committer_email_pattern',
                                parameters: {
                                    operator: 'regex',
                                },
                            },
                        ],
                    }),
                    text: async () => '',
                } as Response;
            }

            throw new Error(`Unexpected fetch URL: ${requestUrl}`);
        });

        await service.syncWithGitHub();

        const gitShowCall = gitCommandsWithOptions.find((call) =>
            call.command.startsWith('git show origin/main:githooks-rulesets.json')
        );
        const repositoryInfoCall = gitCommandsWithOptions.find((call) =>
            call.command.startsWith('git config --get remote.origin.url')
        );

        assert.ok(gitShowCall, 'Expected git show call to be executed');
        assert.ok(repositoryInfoCall, 'Expected git config remote.origin.url call to be executed');
        assert.strictEqual(gitShowCall?.options?.cwd, workspaceRoot);
        assert.strictEqual(repositoryInfoCall?.options?.cwd, workspaceRoot);

        assert.strictEqual(fetchStub.callCount, 3);

        const [listUrl, listInit] = fetchStub.getCall(0).args;
        assert.strictEqual(listUrl, 'https://api.github.com/repos/NexusInnovation/nexus-nexkit-vscode/rulesets');
        assert.strictEqual((listInit as RequestInit)?.method, 'GET');

        const [detailsFirstUrl, detailsFirstInit] = fetchStub.getCall(1).args;
        assert.strictEqual(detailsFirstUrl, 'https://api.github.com/repos/NexusInnovation/nexus-nexkit-vscode/rulesets/10');
        assert.strictEqual((detailsFirstInit as RequestInit)?.method, 'GET');

        const [detailsSecondUrl, detailsSecondInit] = fetchStub.getCall(2).args;
        assert.strictEqual(detailsSecondUrl, 'https://api.github.com/repos/NexusInnovation/nexus-nexkit-vscode/rulesets/20');
        assert.strictEqual((detailsSecondInit as RequestInit)?.method, 'GET');

        const requestHeaders = (listInit as RequestInit)?.headers as Record<string, string>;
        assert.strictEqual(requestHeaders['X-GitHub-Api-Version'], '2022-11-28');
        assert.strictEqual(requestHeaders.Accept, 'application/vnd.github+json');
        assert.strictEqual(requestHeaders.Authorization, 'token test-token');

        const detailsFirstHeaders = (detailsFirstInit as RequestInit)?.headers as Record<string, string>;
        assert.strictEqual(detailsFirstHeaders.Authorization, 'token test-token');

        const detailsSecondHeaders = (detailsSecondInit as RequestInit)?.headers as Record<string, string>;
        assert.strictEqual(detailsSecondHeaders.Authorization, 'token test-token');

        assert.strictEqual(saveRulesetStub.calledOnce, true);
        const savedRuleset = saveRulesetStub.firstCall.args[0] as GitHooksRuleset;

        assert.strictEqual(savedRuleset.rules.length, 2);
        assert.deepStrictEqual(savedRuleset.rules[0], {
            type: 'commit_message_pattern',
            parameters: {
                operator: 'regex',
                pattern: '^NEX-[0-9]+',
            },
        });
        assert.deepStrictEqual(savedRuleset.rules[1], {
            type: 'branch_name_pattern',
            parameters: {
                operator: 'starts_with',
                pattern: 'feature/',
                negate: false,
            },
        });
    });

    test('syncWithGitHub should fallback and save empty ruleset when GitHub rules are unsupported', async () => {
        const saveRulesetStub = sandbox.stub(RulesManager.prototype, 'saveRuleset').resolves();

        sandbox.stub(childProcess, 'execSync').callsFake((command: string) => {
            if (command.startsWith('git symbolic-ref refs/remotes/origin/HEAD')) {
                return 'refs/remotes/origin/main\n';
            }

            if (command.startsWith('git show origin/main:githooks-rulesets.json')) {
                throw new Error('fatal: path \'githooks-rulesets.json\' does not exist in \'origin/main\'');
            }

            if (command.startsWith('git config --get remote.origin.url')) {
                return 'git@github.com:NexusInnovation/nexus-nexkit-vscode.git\n';
            }

            throw new Error(`Unexpected command: ${command}`);
        });

        sandbox
            .stub(GitHubAuthHelper, 'getAuthHeaders')
            .resolves({ 'User-Agent': 'Nexkit-VSCode-Extension', Authorization: 'token test-token' });

        const fetchStub = sandbox.stub(globalThis, 'fetch').callsFake(async (url: string | URL | Request) => {
            const requestUrl = String(url);

            if (requestUrl === 'https://api.github.com/repos/NexusInnovation/nexus-nexkit-vscode/rulesets') {
                return {
                    ok: true,
                    status: 200,
                    json: async () => [{ id: 100 }, { id: 200 }],
                    text: async () => '',
                } as Response;
            }

            if (requestUrl === 'https://api.github.com/repos/NexusInnovation/nexus-nexkit-vscode/rulesets/100') {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        rules: [
                            {
                                type: 'pull_request',
                                parameters: {
                                    dismiss_stale_reviews_on_push: true,
                                },
                            },
                            {
                                type: 'commit_author_email_pattern',
                                parameters: {
                                    operator: 'contains',
                                },
                            },
                        ],
                    }),
                    text: async () => '',
                } as Response;
            }

            if (requestUrl === 'https://api.github.com/repos/NexusInnovation/nexus-nexkit-vscode/rulesets/200') {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        rules: [
                            {
                                type: 'tag_name_pattern',
                                parameters: {
                                    operator: 'unknown',
                                    pattern: 'v',
                                },
                            },
                        ],
                    }),
                    text: async () => '',
                } as Response;
            }

            throw new Error(`Unexpected fetch URL: ${requestUrl}`);
        });

        await service.syncWithGitHub();

        assert.strictEqual(fetchStub.callCount, 3);

        assert.strictEqual(saveRulesetStub.calledOnce, true);
        const savedRuleset = saveRulesetStub.firstCall.args[0] as GitHooksRuleset;
        assert.deepStrictEqual(savedRuleset, { rules: [] });
    });
});