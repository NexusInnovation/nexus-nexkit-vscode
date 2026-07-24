import * as vscode from 'vscode';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SettingsManager } from '../../../core/settingsManager';
import { RulesManager } from './RulesManager';
import { HooksInstaller } from './HooksInstaller';
import { GitHookRule, GitHooksStatus, GitHooksRuleset } from '../types';
import { LoggingService } from '../../../shared/services/loggingService';
import { GitHubAuthHelper } from '../../../shared/utils/githubAuthHelper';
import { getWorkspaceRoot } from '../../../shared/utils/fileHelper';

/**
 * Main orchestrator service for git hooks management
 * Coordinates installation, rule management, and sync with GitHub
 */
export class GitHooksService {
    private static readonly GITHUB_API_VERSION = '2022-11-28';
    private static readonly SUPPORTED_RULE_TYPES = new Set([
        'commit_message_pattern',
        'commit_author_email_pattern',
        'committer_email_pattern',
        'branch_name_pattern',
        'tag_name_pattern',
    ]);

    private readonly _logger = LoggingService.getInstance();
    private readonly _rulesManager: RulesManager;
    private readonly _hooksInstaller: HooksInstaller;

    constructor() {
        this._rulesManager = new RulesManager();
        this._hooksInstaller = new HooksInstaller();
    }

    /**
     * Get current status of git hooks
     */
    public async getStatus(): Promise<GitHooksStatus> {
        try {
            const isInstalled = this._hooksInstaller.isInstalled();
            const isEnabled = SettingsManager.isGitHooksEnabled();
            const pythonAvailable = await this._hooksInstaller.checkPythonAvailable();
            const rulesCount = await this._rulesManager.getRulesCount();

            return {
                isInstalled,
                isEnabled,
                rulesLoaded: rulesCount,
                pythonAvailable,
            };
        } catch (error) {
            this._logger.error('Error getting git hooks status:', error);
            return {
                isInstalled: false,
                isEnabled: false,
                rulesLoaded: 0,
                pythonAvailable: false,
                message: 'Error getting status',
            };
        }
    }

    /**
     * Setup git hooks - install scripts and configure git
     */
    public async setup(): Promise<void> {
        try {
            this._logger.info('Setting up git hooks...');

            // Check if already installed
            if (this._hooksInstaller.isInstalled()) {
                this._logger.info('Git hooks already installed, skipping setup');
                return;
            }

            // Install hooks
            await this._hooksInstaller.install();
            this._logger.info('Git hooks installed successfully');

            // Enable by default
            await SettingsManager.setGitHooksEnabled(true);

            // Notify user
            vscode.window.showInformationMessage('✅ Git hooks installed successfully!');
        } catch (error) {
            this._logger.error('Error setting up git hooks:', error);
            vscode.window.showErrorMessage(`Failed to setup git hooks: ${error}`);
            throw error;
        }
    }

    /**
     * Enable git hooks validation
     */
    public async enable(): Promise<void> {
        try {
            await SettingsManager.setGitHooksEnabled(true);
            this._logger.info('Git hooks enabled');
        } catch (error) {
            this._logger.error('Error enabling git hooks:', error);
            throw error;
        }
    }

    /**
     * Disable git hooks validation
     */
    public async disable(): Promise<void> {
        try {
            await SettingsManager.setGitHooksEnabled(false);
            this._logger.info('Git hooks disabled');
        } catch (error) {
            this._logger.error('Error disabling git hooks:', error);
            throw error;
        }
    }

    /**
     * Sync rules from GitHub rulesets
     * Fetches githooks-rulesets.json from the remote repository using existing git authentication
     * Uses git credentials (SSH keys or stored HTTPS tokens) - no separate token needed
     * If file doesn't exist on remote, creates a default empty ruleset locally
     */
    public async syncWithGitHub(): Promise<void> {
        try {
            this._logger.info('Syncing git hooks rules from GitHub...');

            // Get default branch (usually main or master)
            const defaultBranch = this._getDefaultBranch();
            this._logger.info(`Using default branch: ${defaultBranch}`);

            let ruleset: GitHooksRuleset;
            let createdFromRemote = false;

            try {
                // Try to fetch the rulesets file from remote using git show
                // This uses existing SSH keys or stored HTTPS credentials automatically
                const content = execSync(`git show origin/${defaultBranch}:githooks-rulesets.json`, {
                    encoding: 'utf8',
                    stdio: ['pipe', 'pipe', 'pipe'], // capture stderr to avoid cluttering logs
                    cwd: this._getGitCommandCwd(),
                });

                // Parse and validate the fetched ruleset
                ruleset = JSON.parse(content);
                createdFromRemote = true;

                if (!ruleset.rules || !Array.isArray(ruleset.rules)) {
                    throw new Error('Invalid githooks-rulesets.json: missing "rules" array');
                }

                this._logger.info(`✅ Fetched ${ruleset.rules.length} rules from remote`);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);

                // If file doesn't exist on remote, create a default empty ruleset
                if (
                    errorMsg.includes('fatal: path') ||
                    errorMsg.includes('does not exist') ||
                    errorMsg.includes('not found')
                ) {
                    this._logger.info('githooks-rulesets.json not found on remote, fetching GitHub repository rulesets');
                    ruleset = await this._buildRulesetFromGitHubRulesets();
                    this._logger.info(`✅ Mapped ${ruleset.rules.length} supported rules from GitHub rulesets`);

                    if (ruleset.rules.length > 0) {
                        vscode.window.showInformationMessage(
                            `No githooks-rulesets.json found on remote. Synced ${ruleset.rules.length} rule(s) from GitHub rulesets.`
                        );
                    } else {
                        vscode.window.showInformationMessage(
                            'No githooks-rulesets.json found on remote. Created empty ruleset locally from GitHub rulesets.'
                        );
                    }
                } else {
                    // Other errors should be re-thrown
                    throw error;
                }
            }

            // Save locally
            await this._rulesManager.saveRuleset(ruleset);
            this._logger.info(
                `✅ Git hooks rules synced: ${ruleset.rules.length} rules ${createdFromRemote ? 'from remote' : '(created default)'}`
            );

            if (createdFromRemote) {
                vscode.window.showInformationMessage(
                    `✅ Git hooks rules synced successfully! (${ruleset.rules.length} rules)`
                );
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);

            // Provide helpful error messages for common issues
            if (errorMsg.includes('fatal:') && errorMsg.includes('No remote')) {
                this._logger.error('No remote repository configured');
                vscode.window.showErrorMessage(
                    'No git remote repository configured. Initialize git and add a remote.'
                );
            } else if (errorMsg.includes('Authentication') || errorMsg.includes('Permission denied')) {
                this._logger.error('Authentication failed - check your git credentials');
                vscode.window.showErrorMessage(
                    'Authentication failed. Ensure your git credentials (SSH key or stored HTTPS token) are configured.'
                );
            } else {
                this._logger.error('Error syncing git hooks with GitHub:', error);
                vscode.window.showErrorMessage(`Failed to sync git hooks: ${errorMsg}`);
            }

            throw error;
        }
    }

    /**
     * Get default branch of the repository (main, master, etc.)
     * Falls back to common defaults if symbolic-ref fails
     */
    private _getDefaultBranch(): string {
        try {
            // Try to get default branch from remote HEAD
            const result = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
                encoding: 'utf8',
                cwd: this._getGitCommandCwd(),
            })
                .trim();

            // Output is "refs/remotes/origin/main" - extract branch name
            const match = result.match(/refs\/remotes\/origin\/(.+)$/);
            if (match) {
                return match[1];
            }
        } catch {
            // symbolic-ref might fail if remote HEAD is not set
        }

        // Try common defaults
        for (const branch of ['main', 'master', 'develop']) {
            try {
                execSync(`git rev-parse origin/${branch}`, {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    cwd: this._getGitCommandCwd(),
                });
                return branch;
            } catch {
                // Branch doesn't exist, continue to next
            }
        }

        // Fallback to main
        return 'main';
    }

    private async _buildRulesetFromGitHubRulesets(): Promise<GitHooksRuleset> {
        const repositoryInfo = this.getRepositoryInfo();
        const { owner, repo } = repositoryInfo;

        if (!owner || !repo) {
            this._logger.warn('Could not determine repository owner/repo from origin URL. Falling back to empty ruleset.');
            return { rules: [] };
        }

        try {
            const headers = await GitHubAuthHelper.getAuthHeaders(['repo']);
            headers.Accept = 'application/vnd.github+json';
            headers['X-GitHub-Api-Version'] = GitHooksService.GITHUB_API_VERSION;

            const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/rulesets`, {
                method: 'GET',
                headers,
            });

            if (!response.ok) {
                const responseBody = await response.text().catch(() => '');
                this._logger.warn(
                    `GitHub rulesets request failed with status ${response.status}. Falling back to empty ruleset.`,
                    responseBody
                );
                return { rules: [] };
            }

            const rulesetsPayload: unknown = await response.json();
            const rulesetsDetailsPayload = await this._fetchRulesetDetailsById(owner, repo, headers, rulesetsPayload);
            const rules = this._extractSupportedRules(rulesetsDetailsPayload);

            return { rules };
        } catch (error) {
            this._logger.error('Failed to fetch GitHub rulesets. Falling back to empty ruleset.', error);
            return { rules: [] };
        }
    }

    private async _fetchRulesetDetailsById(
        owner: string,
        repo: string,
        headers: Record<string, string>,
        rulesetsPayload: unknown
    ): Promise<unknown[]> {
        const rulesetIds = this._extractRulesetIds(rulesetsPayload);
        const rulesetsDetailsPayload: unknown[] = [];

        for (const rulesetId of rulesetIds) {
            const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/rulesets/${rulesetId}`, {
                method: 'GET',
                headers,
            });

            if (!response.ok) {
                const responseBody = await response.text().catch(() => '');
                this._logger.warn(
                    `GitHub ruleset details request failed for ruleset ${rulesetId} with status ${response.status}. Skipping ruleset.`,
                    responseBody
                );
                continue;
            }

            rulesetsDetailsPayload.push(await response.json());
        }

        return rulesetsDetailsPayload;
    }

    private _extractRulesetIds(rulesetsPayload: unknown): number[] {
        if (!Array.isArray(rulesetsPayload)) {
            this._logger.warn('GitHub rulesets payload is not an array. Falling back to empty ruleset.');
            return [];
        }

        const rulesetIds: number[] = [];

        for (const rulesetEntry of rulesetsPayload) {
            if (!rulesetEntry || typeof rulesetEntry !== 'object') {
                continue;
            }

            const id = (rulesetEntry as { id?: unknown }).id;
            if (typeof id === 'number') {
                rulesetIds.push(id);
            }
        }

        return rulesetIds;
    }

    private _extractSupportedRules(rulesetsPayload: unknown): GitHookRule[] {
        if (!Array.isArray(rulesetsPayload)) {
            this._logger.warn('GitHub rulesets payload is not an array. Falling back to empty ruleset.');
            return [];
        }

        const mappedRules: GitHookRule[] = [];

        for (const rulesetEntry of rulesetsPayload) {
            const rules = this._readRulesArray(rulesetEntry);
            if (!rules) {
                continue;
            }

            for (const rule of rules) {
                const mappedRule = this._mapGitHubRule(rule);
                if (mappedRule) {
                    mappedRules.push(mappedRule);
                }
            }
        }

        return mappedRules;
    }

    private _readRulesArray(rulesetEntry: unknown): unknown[] | undefined {
        if (!rulesetEntry || typeof rulesetEntry !== 'object') {
            return undefined;
        }

        const candidate = (rulesetEntry as { rules?: unknown }).rules;
        return Array.isArray(candidate) ? candidate : undefined;
    }

    private _mapGitHubRule(rule: unknown): GitHookRule | undefined {
        if (!rule || typeof rule !== 'object') {
            return undefined;
        }

        const type = (rule as { type?: unknown }).type;
        if (typeof type !== 'string' || !GitHooksService.SUPPORTED_RULE_TYPES.has(type)) {
            return undefined;
        }

        const parameters = (rule as { parameters?: unknown }).parameters;
        if (!parameters || typeof parameters !== 'object') {
            return undefined;
        }

        const operator = (parameters as { operator?: unknown }).operator;
        const pattern = (parameters as { pattern?: unknown }).pattern;
        const negate = (parameters as { negate?: unknown }).negate;

        if (!this._isSupportedOperator(operator) || typeof pattern !== 'string') {
            return undefined;
        }

        const mappedRule: GitHookRule = {
            type,
            parameters: {
                operator,
                pattern,
            },
        };

        if (typeof negate === 'boolean') {
            mappedRule.parameters.negate = negate;
        }

        return mappedRule;
    }

    private _isSupportedOperator(operator: unknown): operator is GitHookRule['parameters']['operator'] {
        return (
            operator === 'regex' ||
            operator === 'starts_with' ||
            operator === 'ends_with' ||
            operator === 'contains'
        );
    }


    /**
     * Load current ruleset
     */
    public async loadRules(): Promise<GitHooksRuleset> {
        try {
            return await this._rulesManager.loadRuleset();
        } catch (error) {
            this._logger.error('Error loading git hooks rules:', error);
            return { rules: [] };
        }
    }

    /**
     * Save ruleset
     */
    public async saveRules(ruleset: GitHooksRuleset): Promise<void> {
        try {
            await this._rulesManager.saveRuleset(ruleset);
            this._logger.info(`Git hooks rules saved: ${ruleset.rules.length} rules`);
        } catch (error) {
            this._logger.error('Error saving git hooks rules:', error);
            throw error;
        }
    }

    /**
     * Get git repository information
     */
    public getRepositoryInfo(): { owner?: string; repo?: string; remote?: string } {
        try {
            const remote = execSync('git config --get remote.origin.url', {
                encoding: 'utf8',
                cwd: this._getGitCommandCwd(),
            })
                .trim();

            // Parse owner/repo from remote URL (handles both HTTPS and SSH)
            // https://github.com/owner/repo.git -> owner/repo
            // git@github.com:owner/repo.git -> owner/repo
            const match = remote.match(/[:/]([^/]+)\/([^/]+?)(\.git)?$/);
            if (match) {
                return {
                    owner: match[1],
                    repo: match[2],
                    remote,
                };
            }

            return { remote };
        } catch {
            return {};
        }
    }

    private _getGitCommandCwd(): string | undefined {
        try {
            const workspaceRoot = getWorkspaceRoot();
            if (!workspaceRoot) {
                this._logger.warn('Workspace root not found; running git command without cwd.');
                return undefined;
            }

            return workspaceRoot;
        } catch (error) {
            this._logger.warn('Failed to resolve workspace root for git command; running without cwd.', error);
            return undefined;
        }
    }
}
