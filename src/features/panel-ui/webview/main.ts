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
let templateSearch: HTMLInputElement;
let searchClearBtn: HTMLButtonElement;
let collapseAllBtn: HTMLButtonElement;

// Global workspace state
const workspaceState = {
  hasWorkspace: false,
  isInitialized: false,
};

// Search state
let currentSearchQuery = "";

// Template service
const templateService = new TemplateService(vscode);

// Expansion state management
interface WebviewState {
  expandedSections: Record<string, boolean>;
}

/**
 * Get the saved webview state
 */
function getState(): WebviewState {
  const state = vscode.getState();
  return state || { expandedSections: {} };
}

/**
 * Save the webview state
 */
function saveState(state: WebviewState): void {
  vscode.setState(state);
}

/**
 * Set expansion state for a section
 */
function setSectionExpanded(repository: string, type: string, expanded: boolean): void {
  const state = getState();
  const key = `${repository}::${type}`;
  state.expandedSections[key] = expanded;
  saveState(state);
}

/**
 * Get all expansion states
 */
function getExpansionStates(): Record<string, boolean> {
  return getState().expandedSections;
}

/**
 * Capture current expansion state from the DOM before re-rendering
 */
function captureCurrentExpansionState(): void {
  const details = templateContainer.querySelectorAll<HTMLDetailsElement>(".type-section");
  details.forEach((detail) => {
    const repository = detail.getAttribute("data-repository");
    const type = detail.getAttribute("data-type");
    if (repository && type) {
      setSectionExpanded(repository, type, detail.open);
    }
  });
}

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
  templateSearch = document.getElementById("templateSearch") as HTMLInputElement;
  searchClearBtn = document.getElementById("searchClearBtn") as HTMLButtonElement;
  collapseAllBtn = document.getElementById("collapseAllBtn") as HTMLButtonElement;

  // Initialize template service
  templateService.initialize();

  // Subscribe to template data updates
  templateService.onTemplateDataUpdate((repositories) => {
    captureCurrentExpansionState();
    const installed = templateService.getInstalledTemplates();
    const expansionStates = getExpansionStates();
    renderTemplateManagement(repositories, templateService, installed, expansionStates, currentSearchQuery, templateContainer);
  });

  // Subscribe to installed templates updates
  templateService.onInstalledTemplatesUpdate((installed) => {
    // Capture current state before re-rendering
    captureCurrentExpansionState();

    const repositories = templateService.getRepositories();
    if (repositories.length > 0) {
      const expansionStates = getExpansionStates();
      renderTemplateManagement(repositories, templateService, installed, expansionStates, currentSearchQuery, templateContainer);
    }
  });

  // Search input handler
  templateSearch.addEventListener("input", (e) => {
    currentSearchQuery = (e.target as HTMLInputElement).value.trim();

    // Toggle clear button visibility
    searchClearBtn.style.display = currentSearchQuery.length > 0 ? "block" : "none";

    const repositories = templateService.getRepositories();
    const installed = templateService.getInstalledTemplates();
    const expansionStates = getExpansionStates();
    renderTemplateManagement(repositories, templateService, installed, expansionStates, currentSearchQuery, templateContainer);
  });

  // Clear button handler
  searchClearBtn.addEventListener("click", () => {
    templateSearch.value = "";
    currentSearchQuery = "";
    searchClearBtn.style.display = "none";

    const repositories = templateService.getRepositories();
    const installed = templateService.getInstalledTemplates();
    const expansionStates = getExpansionStates();
    renderTemplateManagement(repositories, templateService, installed, expansionStates, currentSearchQuery, templateContainer);
  });

  // Collapse all button handler
  collapseAllBtn.addEventListener("click", () => {
    const details = templateContainer.querySelectorAll<HTMLDetailsElement>(".type-section");
    details.forEach((detail) => {
      detail.open = false;
      const repository = detail.getAttribute("data-repository");
      const type = detail.getAttribute("data-type");
      if (repository && type) {
        setSectionExpanded(repository, type, false);
      }
    });
  });

  // Event delegation for tracking section expansion state
  templateContainer.addEventListener("toggle", (e) => {
    const target = e.target as HTMLDetailsElement;
    if (target.tagName === "DETAILS" && target.classList.contains("type-section")) {
      // Extract repository and type from data attributes
      const repository = target.getAttribute("data-repository");
      const type = target.getAttribute("data-type");

      if (repository && type) {
        setSectionExpanded(repository, type, target.open);
      }
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
