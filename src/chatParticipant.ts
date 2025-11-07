import * as vscode from "vscode";
import { TelemetryService } from "./telemetryService";

/**
 * Nexkit Chat Participant
 * Handles @nexkit chat commands by reading prompt files and forwarding to the language model
 */
export class NexkitChatParticipant implements vscode.Disposable {
  private participant: vscode.ChatParticipant;
  private readonly SUPPORTED_COMMANDS = [
    "nexkit.implement",
    "nexkit.refine",
    "nexkit.commit",
    "nexkit.document",
    "nexkit.review",
    "nexkit.refactor",
  ];

  constructor(
    private context: vscode.ExtensionContext,
    private telemetryService: TelemetryService
  ) {
    // Create the chat participant
    this.participant = vscode.chat.createChatParticipant(
      "nexkit-vscode.nexkit",
      this.handleChatRequest.bind(this)
    );

    // Set participant properties
    this.participant.iconPath = vscode.Uri.joinPath(
      context.extensionUri,
      "media",
      "Nexus_Symbole_MONOCHROME.svg"
    );

    // Register for disposal
    context.subscriptions.push(this.participant);
  }

  /**
   * Main chat request handler
   */
  private async handleChatRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    const startTime = Date.now();
    let success = false;

    try {
      const command = request.command || "";

      // If no command specified, show guidance message
      if (!command) {
        stream.markdown(
          `ℹ️ **@nexkit** is designed to work with specific commands.\n\n`
        );
        stream.markdown(`**Available commands:**\n\n`);
        stream.markdown(
          `- \`/nexkit.implement\` - Implement features or changes\n`
        );
        stream.markdown(`- \`/nexkit.refine\` - Refine existing code\n`);
        stream.markdown(`- \`/nexkit.commit\` - Generate commit messages\n`);
        stream.markdown(`- \`/nexkit.document\` - Generate documentation\n`);
        stream.markdown(`- \`/nexkit.review\` - Review code changes\n`);
        stream.markdown(`- \`/nexkit.refactor\` - Refactor code\n\n`);
        stream.markdown(
          `💡 For general questions, use the regular Copilot chat without @nexkit.\n`
        );
        success = true;
        return { metadata: { command: "none", showedGuidance: true } };
      }

      // Validate command
      if (!this.SUPPORTED_COMMANDS.includes(command)) {
        stream.markdown(`⚠️ Unknown command: \`/${command}\`\n\n`);
        stream.markdown(`Supported commands:\n`);
        this.SUPPORTED_COMMANDS.forEach((cmd) => {
          stream.markdown(`- \`/${cmd}\`\n`);
        });
        return { metadata: { command } };
      }

      // Read the prompt file
      const promptContent = await this.readPromptFile(command);

      if (!promptContent) {
        stream.markdown(`⚠️ Prompt file not found for \`/${command}\`\n\n`);
        stream.markdown(
          `This might be an issue with the extension installation.\n`
        );
        stream.markdown(
          `Try reinstalling the Nexkit extension or contact support.`
        );
        return { metadata: { command, error: "prompt_file_not_found" } };
      }

      // Send request to the language model
      stream.markdown(`🔧 Executing \`/${command}\`...\n\n`);
      const messages = this.buildMessages(
        promptContent,
        request.prompt,
        request.references
      );
      await this.sendAndStreamResponse(messages, request.model, stream, token);

      success = true;

      // Track the chat command usage with duration
      const duration = Date.now() - startTime;
      this.telemetryService.trackChatCommand(command, {
        prompt: request.prompt.substring(0, 100), // First 100 chars only for privacy
        hasReferences: request.references.length > 0,
        referenceCount: request.references.length,
        durationMs: duration,
        success: true,
      });

      return { metadata: { command, success: true } };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log error to telemetry with duration
      this.telemetryService.trackError(error as Error, {
        component: "chatParticipant",
        command: request.command || "unknown",
        durationMs: duration.toString(),
      });

      // Track failed command with duration
      if (request.command) {
        this.telemetryService.trackChatCommand(request.command, {
          prompt: request.prompt.substring(0, 100),
          hasReferences: request.references.length > 0,
          referenceCount: request.references.length,
          durationMs: duration,
          success: false,
          error: error instanceof Error ? error.message : "unknown",
        });
      }

      // Show error to user
      stream.markdown(
        `\n\n❌ Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }\n`
      );

      return {
        metadata: {
          command: request.command,
          error: error instanceof Error ? error.message : "unknown",
        },
      };
    }
  }

  /**
   * Build messages array for the language model
   */
  private buildMessages(
    promptContent: string | null,
    userPrompt: string,
    references: readonly vscode.ChatPromptReference[]
  ): vscode.LanguageModelChatMessage[] {
    const messages: vscode.LanguageModelChatMessage[] = [];

    // Add prompt file content if available (for commands)
    if (promptContent) {
      messages.push(vscode.LanguageModelChatMessage.User(promptContent));
    }

    // Add user's prompt
    messages.push(vscode.LanguageModelChatMessage.User(userPrompt));

    // Add context from references if available
    if (references.length > 0) {
      const referencesText = this.formatReferences(references);
      messages.push(
        vscode.LanguageModelChatMessage.User(`Context:\n${referencesText}`)
      );
    }

    return messages;
  }

  /**
   * Send request to language model and stream the response
   */
  private async sendAndStreamResponse(
    messages: vscode.LanguageModelChatMessage[],
    model: vscode.LanguageModelChat,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    const chatResponse = await model.sendRequest(messages, {}, token);

    // Stream the response
    for await (const fragment of chatResponse.text) {
      stream.markdown(fragment);
    }
  }

  /**
   * Read prompt file from extension resources
   */
  private async readPromptFile(command: string): Promise<string | null> {
    try {
      // Read from extension's resources/prompts directory
      const promptFilePath = vscode.Uri.joinPath(
        this.context.extensionUri,
        "resources",
        "prompts",
        `${command}.prompt.md`
      );

      const contentBytes = await vscode.workspace.fs.readFile(promptFilePath);
      const content = new TextDecoder().decode(contentBytes);
      return content;
    } catch (error) {
      console.error(`Failed to read prompt file for ${command}:`, error);
      return null;
    }
  }

  /**
   * Format chat references for context
   */
  private formatReferences(
    references: readonly vscode.ChatPromptReference[]
  ): string {
    return references
      .map((ref, index) => {
        const id = ref.id;
        if (id && typeof id === "object" && "fsPath" in id) {
          // It's a Uri-like object
          return `[${index + 1}] File: ${(id as vscode.Uri).fsPath}`;
        } else if (typeof id === "string") {
          return `[${index + 1}] ${id}`;
        } else {
          return `[${index + 1}] Reference: ${JSON.stringify(id)}`;
        }
      })
      .join("\n");
  }

  /**
   * Dispose the chat participant
   */
  public dispose(): void {
    this.participant.dispose();
  }
}
