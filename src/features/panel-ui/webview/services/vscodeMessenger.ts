/**
 * VSCode Messenger - Simplified message bridge between webview and extension
 * Handles message sending and listening with type safety
 */

import { WebviewMessage, ExtensionMessage } from "../types";

type MessageHandler<T extends ExtensionMessage> = (message: T) => void;

/**
 * Simplified messenger for VS Code webview communication
 * Provides type-safe message sending and event listening
 */
export class VSCodeMessenger {
  private vscode: any;
  private messageHandlers: Map<string, MessageHandler<any>[]> = new Map();

  constructor() {
    // @ts-ignore - acquireVsCodeApi is injected by VS Code
    this.vscode = acquireVsCodeApi();
    this.setupMessageListener();
  }

  /**
   * Set up the global message listener that dispatches to registered handlers
   */
  private setupMessageListener(): void {
    window.addEventListener("message", (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;
      if (message.command) {
        const handlers = this.messageHandlers.get(message.command);
        if (handlers) {
          handlers.forEach((handler) => handler(message));
        }
      }
    });
  }

  /**
   * Send a message to the extension
   */
  public sendMessage(message: WebviewMessage): void {
    this.vscode.postMessage(message);
  }

  /**
   * Register a handler for a specific message type
   */
  public onMessage<T extends ExtensionMessage>(command: T["command"], handler: MessageHandler<T>): () => void {
    if (!this.messageHandlers.has(command)) {
      this.messageHandlers.set(command, []);
    }

    this.messageHandlers.get(command)!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.messageHandlers.get(command);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Get the VS Code API state
   */
  public getState<T>(): T | undefined {
    return this.vscode.getState();
  }

  /**
   * Set the VS Code API state
   */
  public setState<T>(state: T): void {
    this.vscode.setState(state);
  }
}
