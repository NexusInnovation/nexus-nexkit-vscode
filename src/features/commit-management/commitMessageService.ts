import * as vscode from "vscode";
import { SettingsManager } from "../../core/settingsManager";
import { LoggingService } from "../../shared/services/loggingService";

/**
 * Minimal type definitions for the VS Code Git Extension API
 */
interface GitChange {
  readonly uri: vscode.Uri;
}

interface GitRepository {
  diff(cached: boolean): Promise<string>;
  add(resources: string[]): Promise<void>;
  inputBox: { value: string };
  state: {
    indexChanges: GitChange[];
    workingTreeChanges: GitChange[];
  };
}

interface GitExtensionAPI {
  repositories: GitRepository[];
}

/**
 * Service that generates AI-powered commit messages for staged changes
 * using VS Code's Language Model API (e.g. GitHub Copilot).
 */
/** Placeholder token replaced with the actual git diff in the prompt template. */
const DIFF_PLACEHOLDER = "{{diff}}";

/** Default system prompt used when the user has not customised the setting. */
export const DEFAULT_SYSTEM_PROMPT = `You are an expert software developer. Generate a concise commit message following the Conventional Commits specification (https://www.conventionalcommits.org/) based on the provided git diff of staged changes.

Format of the commit message:
\`\`\`
<type>(<optional scope>): <description>

- <main change 1>
- <main change 2>
...
- <main change n>
\`\`\`
Types: feat, fix, docs, style, refactor, test, chore, build, ci, perf, revert
main change: one liner defining the change

Rules:
- Keep the subject line under 72 characters
- Use imperative mood ("add feature" not "added feature")
- Do not end with a period
- Be specific and meaningful about what changed
- list at most 5 <main changes>
- Add an estimate amount of work to review this commit

Git diff:
{{diff}}

Respond with ONLY the commit message, no explanation, no markdown formatting.`;

export class CommitMessageService {
  private readonly _logging = LoggingService.getInstance();

  /** Maximum number of characters of a git diff sent to the AI model. */
  static readonly MAX_DIFF_LENGTH = 8000;

  /**
   * Generate a commit message for the currently staged git changes and
   * populate the SCM input box with the result.
   */
  async generateCommitMessage(): Promise<void> {
    if (!SettingsManager.isCommitMessageEnabled()) {
      this._logging.info("Commit message generation is disabled via settings");
      return;
    }

    const repo = await this._getActiveRepository();
    if (!repo) {
      return;
    }

    let diff = await repo.diff(true);
    if (!diff || diff.trim().length === 0) {
      // No staged changes – automatically stage all unstaged files
      const workingTreeChanges = repo.state.workingTreeChanges ?? [];

      if (workingTreeChanges.length === 0) {
        this._logging.info("No changes found to stage");
        vscode.window.showInformationMessage("Nexkit: No changes found in the working tree.");
        return;
      }

      this._logging.info(`Auto-staging ${workingTreeChanges.length} unstaged file(s)`);
      try {
        const filePaths = workingTreeChanges.map((c) => c.uri.fsPath);
        await repo.add(filePaths);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this._logging.error(`Failed to stage changes: ${msg}`);
        vscode.window.showErrorMessage(`Nexkit: Failed to stage changes: ${msg}`);
        return;
      }

      // Re-read the diff now that changes have been staged
      diff = await repo.diff(true);
      if (!diff || diff.trim().length === 0) {
        this._logging.warn("Diff is still empty after auto-staging");
        vscode.window.showInformationMessage("Nexkit: No diff detected after staging. Please check your working tree.");
        return;
      }
    }

    const model = await this._selectLanguageModel();
    if (!model) {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Nexkit: Generating commit message…",
        cancellable: true,
      },
      async (_, token) => {
        const messages = [vscode.LanguageModelChatMessage.User(this.buildPrompt(diff))];
        let commitMessage = "";

        try {
          const response = await model.sendRequest(messages, {}, token);
          for await (const chunk of response.text) {
            if (token.isCancellationRequested) {
              return;
            }
            commitMessage += chunk;
          }
        } catch (error) {
          if (error instanceof vscode.CancellationError) {
            return;
          }
          const msg = error instanceof Error ? error.message : String(error);
          this._logging.error(`Failed to generate commit message: ${msg}`);
          vscode.window.showErrorMessage(`Nexkit: Failed to generate commit message: ${msg}`);
          return;
        }

        const trimmed = commitMessage.trim();
        if (trimmed) {
          repo.inputBox.value = trimmed;
        }
      }
    );
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async _getActiveRepository(): Promise<GitRepository | undefined> {
    const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports as
      | { getAPI(version: 1): GitExtensionAPI }
      | undefined;

    if (!gitExtension) {
      this._logging.warn("Git extension not found");
      vscode.window.showErrorMessage("Nexkit: Git extension not found. Please ensure the built-in Git extension is enabled.");
      return undefined;
    }

    const git = gitExtension.getAPI(1);
    const repos = git.repositories;

    if (!repos || repos.length === 0) {
      this._logging.warn("No Git repository found in the current workspace");
      vscode.window.showErrorMessage("Nexkit: No Git repository found in the current workspace.");
      return undefined;
    }

    if (repos.length === 1) {
      return repos[0];
    }

    // Multiple repositories: prefer the one with staged changes.
    const reposWithStaged = repos.filter((r) => r.state.indexChanges.length > 0);
    if (reposWithStaged.length === 1) {
      return reposWithStaged[0];
    }

    // Fall back to the first repository.
    return repos[0];
  }

  private async _selectLanguageModel(): Promise<vscode.LanguageModelChat | undefined> {
    try {
      const configuredModel = SettingsManager.getCommitMessageModel();

      // Build selector chain: configured model first, then fallbacks.
      const selectors: vscode.LanguageModelChatSelector[] = configuredModel
        ? [{ vendor: "copilot", family: configuredModel }, { family: configuredModel }, { vendor: "copilot" }, {}]
        : [{ vendor: "copilot", family: "gpt-4o" }, { vendor: "copilot" }, {}];

      for (const selector of selectors) {
        const models = await vscode.lm.selectChatModels(selector);
        if (models.length > 0) {
          this._logging.info(`Using AI model: ${models[0].name} (${models[0].family})`);
          return models[0];
        }
      }

      const choice = await vscode.window.showErrorMessage(
        "Nexkit: No AI model available. Please ensure GitHub Copilot is installed and signed in.",
        "Get Copilot"
      );
      if (choice === "Get Copilot") {
        await vscode.env.openExternal(vscode.Uri.parse("https://github.com/features/copilot"));
      }
      return undefined;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this._logging.error(`Failed to access AI model: ${msg}`);
      vscode.window.showErrorMessage(`Nexkit: Failed to access AI model: ${msg}`);
      return undefined;
    }
  }

  buildPrompt(diff: string, promptTemplate?: string): string {
    // Truncate large diffs to stay within model token limits.
    const truncatedDiff =
      diff.length > CommitMessageService.MAX_DIFF_LENGTH
        ? `${diff.substring(0, CommitMessageService.MAX_DIFF_LENGTH)}\n... (diff truncated)`
        : diff;

    const template = promptTemplate || SettingsManager.getCommitMessageSystemPrompt() || DEFAULT_SYSTEM_PROMPT;

    // Replace the {{diff}} placeholder; if the user removed it, append the diff.
    if (template.includes(DIFF_PLACEHOLDER)) {
      return template.replace(DIFF_PLACEHOLDER, truncatedDiff);
    }

    return `${template}\n\nGit diff:\n${truncatedDiff}`;
  }
}
