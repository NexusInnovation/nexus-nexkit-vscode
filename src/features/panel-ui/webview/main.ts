/// <reference lib="dom" />

/**
 * Webview main script for Nexkit Panel
 * Handles UI interactions and communication with the extension
 */

import { TemplateService, RepositoryTemplateData, TemplateFileData, InstalledTemplatesMap } from "./scripts/templateService";

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
 * Render template management section
 */
function renderTemplateManagement(repositories: RepositoryTemplateData[]): void {
  if (!templateContainer) return;

  // Clear existing content
  templateContainer.innerHTML = "";

  // Show empty state if no repositories
  if (repositories.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "empty-message";
    emptyMessage.textContent = "No template repositories loaded";
    templateContainer.appendChild(emptyMessage);
    return;
  }

  // Render each repository
  repositories.forEach((repo) => {
    const repoSection = createRepositorySection(repo);
    templateContainer.appendChild(repoSection);
  });
}

/**
 * Create a repository section with collapsible type sections
 */
function createRepositorySection(repo: RepositoryTemplateData): HTMLElement {
  const section = document.createElement("div");
  section.className = "repository-section";

  // Repository header
  const header = document.createElement("h3");
  header.className = "repository-name";
  header.textContent = repo.name;
  section.appendChild(header);

  // Create collapsible sections for each type
  const types: Array<keyof typeof repo.types> = ["agents", "prompts", "instructions", "chatmodes"];

  types.forEach((type) => {
    const templates = repo.types[type];
    if (templates.length > 0) {
      const typeSection = createTypeSection(type, templates);
      section.appendChild(typeSection);
    }
  });

  return section;
}

/**
 * Create a collapsible type section
 */
function createTypeSection(type: string, templates: TemplateFileData[]): HTMLElement {
  const details = document.createElement("details");
  details.className = "type-section";

  // Summary (clickable header)
  const summary = document.createElement("summary");
  summary.className = "type-header";
  summary.textContent = `${capitalizeFirst(type)} (${templates.length})`;
  details.appendChild(summary);

  // Template list
  const list = document.createElement("div");
  list.className = "template-list";

  templates.forEach((template) => {
    const item = createTemplateItem(template);
    list.appendChild(item);
  });

  details.appendChild(list);

  return details;
}

/**
 * Create a template item with checkbox
 */
function createTemplateItem(template: TemplateFileData): HTMLElement {
  const item = document.createElement("div");
  item.className = "template-item";

  // Checkbox
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = `template-${template.repository}-${template.type}-${template.name}`;
  checkbox.className = "template-checkbox";
  checkbox.checked = templateService.isTemplateInstalled(template);

  // Checkbox change handler
  checkbox.addEventListener("change", async (e) => {
    const target = e.target as HTMLInputElement;
    const isChecked = target.checked;

    // Disable checkbox during operation
    checkbox.disabled = true;

    try {
      if (isChecked) {
        await templateService.installTemplate(template);
      } else {
        await templateService.uninstallTemplate(template);
      }
    } catch (error) {
      // Revert checkbox state on error
      checkbox.checked = !isChecked;
    } finally {
      checkbox.disabled = false;
    }
  });

  item.appendChild(checkbox);

  // Label
  const label = document.createElement("label");
  label.htmlFor = checkbox.id;
  label.className = "template-label";
  // Remove .md extension from display name
  label.textContent = template.name.replace(/\.md$/, "");
  item.appendChild(label);

  return item;
}

/**
 * Update checkbox states based on installed templates
 */
function updateCheckboxStates(installed: InstalledTemplatesMap): void {
  // Update all checkboxes based on installed state
  const checkboxes = document.querySelectorAll<HTMLInputElement>(".template-checkbox");

  checkboxes.forEach((checkbox) => {
    // Parse template info from checkbox id
    const idParts = checkbox.id.replace("template-", "").split("-");
    if (idParts.length >= 3) {
      const type = idParts[idParts.length - 2];
      const nameWithExtension = idParts.slice(2).join("-");

      const installedList = installed[type as keyof InstalledTemplatesMap] || [];
      const isInstalled = installedList.includes(nameWithExtension);

      checkbox.checked = isInstalled;
    }
  });
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
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
    renderTemplateManagement(repositories);
  });

  // Subscribe to installed templates updates
  templateService.onInstalledTemplatesUpdate((installed) => {
    updateCheckboxStates(installed);
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
