/// <reference lib="dom" />

/**
 * Webview main script for Nexkit Panel
 * Handles UI interactions and communication with the extension
 */

import { TemplateService, RepositoryTemplateData, InstalledTemplatesMap } from "./scripts/templateService";
import { renderTemplateManagement, updateCheckboxStates } from "./scripts/templateRenderer";

// Acquire VS Code API
declare const acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

// Message types for type safety
interface MessageFromExtension {
  command?: "workspaceStateUpdate" | "templateDataUpdate" | "installedTemplatesUpdate";
  hasWorkspace?: boolean;
  isInitialized?: boolean;
  repositories?: RepositoryTemplateData[];
  installed?: InstalledTemplatesMap;
}

interface MessageToExtension {
  command: "ready" | "initProject" | "getTemplateData" | "getInstalledTemplates" | "installTemplate" | "uninstallTemplate";
}

// DOM Elements
let initProjectBtn: HTMLButtonElement;
let initProjectBtnText: HTMLSpanElement;
let initProjectBtnDesc: HTMLParagraphElement;
let templateContainer: HTMLDivElement;

// Global workspace state
const workspaceState = {
  hasWorkspace: false,
  isInitialized: false,
};

// Template service
const templateService = new TemplateService(vscode);

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
    initProjectBtnDesc.textContent = "Reset and reconfigure Nexkit templates and configuration.";
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
  // Template service handles its own messages
}

/**
 * Setup event listeners
 */
function setupEventListeners(): void {
  // Initialize Project button
  initProjectBtn.addEventListener("click", () => {
    sendCommand("initProject");
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
  templateContainer = document.getElementById("templateContainer") as HTMLDivElement;

  // Initialize template service
  templateService.initialize();

  // Subscribe to template data updates
  templateService.onTemplateDataUpdate((repositories) => {
    const installed = templateService.getInstalledTemplates();
    renderTemplateManagement(repositories, templateService, installed, templateContainer);
  });

  // Subscribe to installed templates updates
  templateService.onInstalledTemplatesUpdate((installed) => {
    updateCheckboxStates(installed);

    // Also update the counts in section headers
    const repositories = templateService.getRepositories();
    if (repositories.length > 0) {
      renderTemplateManagement(repositories, templateService, installed, templateContainer);
    }
  });

  // Setup event listeners
  setupEventListeners();

  // Load templates
  templateService.loadTemplates();
  templateService.refreshInstalledTemplates();

  // Signal ready to extension
  sendCommand("ready");
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
