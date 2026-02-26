import * as vscode from "vscode";

/**
 * Minimal type definitions for the VS Code Git Extension API
 */
interface GitRepository {
  diff(cached: boolean): Promise<string>;
  inputBox: { value: string };
  state: {
    indexChanges: unknown[];
  };
}

interface GitExtensionAPI {
  repositories: GitRepository[];
}

/**
 * Service that generates AI-powered commit messages for staged changes
 * using VS Code's Language Model API (e.g. GitHub Copilot).
 */
export class CommitMessageService {
  /** Maximum number of characters of a git diff sent to the AI model. */
  static readonly MAX_DIFF_LENGTH = 8000;
  /**
   * Generate a commit message for the currently staged git changes and
   * populate the SCM input box with the result.
   */
  async generateCommitMessage(): Promise<void> {
    const repo = await this._getActiveRepository();
    if (!repo) {
      return;
    }

    const diff = await repo.diff(true);
    if (!diff || diff.trim().length === 0) {
      vscode.window.showInformationMessage("Nexkit: No staged changes found. Please stage your changes first.");
      return;
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
      vscode.window.showErrorMessage("Nexkit: Git extension not found. Please ensure the built-in Git extension is enabled.");
      return undefined;
    }

    const git = gitExtension.getAPI(1);
    const repos = git.repositories;

    if (!repos || repos.length === 0) {
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
      // Prefer GPT-4o quality model; fall back to any available Copilot model.
      for (const selector of [{ vendor: "copilot", family: "gpt-4o" }, { vendor: "copilot" }, {}] as vscode.LanguageModelChatSelector[]) {
        const models = await vscode.lm.selectChatModels(selector);
        if (models.length > 0) {
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
      vscode.window.showErrorMessage(`Nexkit: Failed to access AI model: ${msg}`);
      return undefined;
    }
  }

  buildPrompt(diff: string): string {
    // Truncate large diffs to stay within model token limits.
    const truncatedDiff =
      diff.length > CommitMessageService.MAX_DIFF_LENGTH
        ? `${diff.substring(0, CommitMessageService.MAX_DIFF_LENGTH)}\n... (diff truncated)`
        : diff;

    return `You are an expert software developer. Generate a concise commit message following the Conventional Commits specification (https://www.conventionalcommits.org/) based on the provided git diff of staged changes.

Format: <type>(<optional scope>): <description>
Types: feat, fix, docs, style, refactor, test, chore, build, ci, perf, revert

Rules:
- Keep the subject line under 72 characters
- Use imperative mood ("add feature" not "added feature")
- Do not end with a period
- Be specific and meaningful about what changed

Git diff:
${truncatedDiff}

Respond with ONLY the commit message on a single line, no explanation, no markdown formatting.`;
  }
}
