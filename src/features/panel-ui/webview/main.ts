/// <reference lib="dom" />

/**
 * Webview main script for Nexkit Panel
 * Handles UI interactions and communication with the extension
 */

// Acquire VS Code API
declare const acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

// Message types for type safety
interface MessageFromExtension {
  command?: "workspaceStateUpdate";
  hasWorkspace?: boolean;
  isInitialized?: boolean;
}

interface MessageToExtension {
  command: "ready" | "initProject" | "installUserMCPs" | "openSettings";
}

// DOM Elements
let initProjectBtn: HTMLButtonElement;
let initProjectBtnText: HTMLSpanElement;
let initProjectBtnDesc: HTMLParagraphElement;
let installMcpBtn: HTMLButtonElement;
let openSettingsBtn: HTMLButtonElement;

// Global workspace state
const workspaceState = {
  hasWorkspace: false,
  isInitialized: false,
};

/**
 * Send a command to the extension
 */
function sendCommand(command: MessageToExtension["command"]): void {
  vscode.postMessage({ command });
}

/**
 * Update button states based on workspace and initialization status
 */
function updateButtonStates(): void {
  // Update init button text
  if (workspaceState.isInitialized) {
    initProjectBtnText.textContent = "Reinitialize Project";
    initProjectBtnDesc.textContent = "Reset and reconfigure Nexkit templates and configuration";
  } else {
    initProjectBtnText.textContent = "Initialize Project";
    initProjectBtnDesc.textContent = "Set up Nexkit templates and configuration for your workspace";
  }

  // Enable/disable based on workspace
  initProjectBtn.disabled = !workspaceState.hasWorkspace;

  // Update description styling
  if (workspaceState.hasWorkspace) {
    initProjectBtnDesc.classList.remove("disabled");
  } else {
    initProjectBtnDesc.classList.add("disabled");
  }
}

/**
 * Handle messages from the extension
 */
function handleMessage(event: MessageEvent<MessageFromExtension>): void {
  const message = event.data;

  // Handle workspace state updates
  if (message.command === "workspaceStateUpdate") {
    if (message.hasWorkspace !== undefined) {
      workspaceState.hasWorkspace = message.hasWorkspace;
    }
    if (message.isInitialized !== undefined) {
      workspaceState.isInitialized = message.isInitialized;
    }
    updateButtonStates();
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners(): void {
  // Initialize Project button
  initProjectBtn.addEventListener("click", () => {
    sendCommand("initProject");
  });

  // Install MCP button
  installMcpBtn.addEventListener("click", () => {
    sendCommand("installUserMCPs");
  });

  // Open Settings button
  openSettingsBtn.addEventListener("click", () => {
    sendCommand("openSettings");
  });

  // Listen for messages from extension
  window.addEventListener("message", handleMessage);
}

/**
 * Initialize the webview
 */
function initialize(): void {
  // Get DOM elements
  initProjectBtn = document.getElementById("initProjectBtn") as HTMLButtonElement;
  initProjectBtnText = document.getElementById("initProjectBtnText") as HTMLSpanElement;
  initProjectBtnDesc = document.getElementById("initProjectBtnDesc") as HTMLParagraphElement;
  installMcpBtn = document.getElementById("installMcpBtn") as HTMLButtonElement;
  openSettingsBtn = document.getElementById("openSettingsBtn") as HTMLButtonElement;

  // Setup event listeners
  setupEventListeners();

  // Signal ready to extension
  sendCommand("ready");
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
