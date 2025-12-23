/// <reference lib="dom" />

/**
 * Template Renderer for creating template UI sections
 * Handles the creation and rendering of template sections in the webview
 */

import { TemplateService, RepositoryTemplateData, TemplateFileData, InstalledTemplatesMap } from "./templateService";

/**
 * Capitalize first letter of a string
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Create a template item with checkbox
 */
function createTemplateItem(template: TemplateFileData, templateService: TemplateService): HTMLElement {
  const item = document.createElement("div");
  item.className = "template-item";

  // Create unique ID using repository, type, and name
  const templateId = `template-${template.repository}::${template.type}::${template.name}`;

  // Checkbox
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = templateId;
  checkbox.className = "template-checkbox";
  checkbox.checked = templateService.isTemplateInstalled(template);

  // Store template data directly on the checkbox element for easy access
  (checkbox as any).templateData = template;

  // Checkbox change handler
  checkbox.addEventListener("change", async (e) => {
    const target = e.target as HTMLInputElement;
    const isChecked = target.checked;
    const templateData = (target as any).templateData as TemplateFileData;

    // Disable checkbox during operation to prevent multiple clicks
    checkbox.disabled = true;

    try {
      if (isChecked) {
        await templateService.installTemplate(templateData);
      } else {
        await templateService.uninstallTemplate(templateData);
      }
      // Note: The template service will trigger an update that refreshes checkbox states
    } catch (error) {
      console.error("Failed to change template state:", error);
      // Revert checkbox state on error
      checkbox.checked = !isChecked;
      checkbox.disabled = false;
    }
  });

  item.appendChild(checkbox);

  // Label
  const label = document.createElement("label");
  label.htmlFor = templateId;
  label.className = "template-label";
  // Remove .md extension from display name
  label.textContent = template.name.replace(/\.md$/, "");
  item.appendChild(label);

  return item;
}

/**
 * Create a collapsible type section
 */
function createTypeSection(
  type: string,
  templates: TemplateFileData[],
  templateService: TemplateService,
  installedTemplates: InstalledTemplatesMap
): HTMLElement {
  const details = document.createElement("details");
  details.className = "type-section";

  // Calculate installed count for this type
  const installedList = installedTemplates[type as keyof InstalledTemplatesMap] || [];
  const installedCount = templates.filter((t) => installedList.includes(t.name)).length;
  const totalCount = templates.length;

  // Summary (clickable header) with count
  const summary = document.createElement("summary");
  summary.className = "type-header";
  summary.textContent = `${capitalizeFirst(type)} (${installedCount}/${totalCount})`;
  details.appendChild(summary);

  // Template list
  const list = document.createElement("div");
  list.className = "template-list";

  templates.forEach((template) => {
    const item = createTemplateItem(template, templateService);
    list.appendChild(item);
  });

  details.appendChild(list);

  return details;
}

/**
 * Create a repository section with collapsible type sections
 */
function createRepositorySection(
  repo: RepositoryTemplateData,
  templateService: TemplateService,
  installedTemplates: InstalledTemplatesMap
): HTMLElement {
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
      const typeSection = createTypeSection(type, templates, templateService, installedTemplates);
      section.appendChild(typeSection);
    }
  });

  return section;
}

/**
 * Render template management section
 */
export function renderTemplateManagement(
  repositories: RepositoryTemplateData[],
  templateService: TemplateService,
  installedTemplates: InstalledTemplatesMap,
  containerElement: HTMLElement
): void {
  if (!containerElement) return;

  // Clear existing content
  containerElement.innerHTML = "";

  // Show empty state if no repositories
  if (repositories.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "empty-message";
    emptyMessage.textContent = "No template repositories loaded";
    containerElement.appendChild(emptyMessage);
    return;
  }

  // Render each repository
  repositories.forEach((repo) => {
    const repoSection = createRepositorySection(repo, templateService, installedTemplates);
    containerElement.appendChild(repoSection);
  });
}

/**
 * Update checkbox states based on installed templates
 * Uses the :: delimiter to parse template information reliably
 */
export function updateCheckboxStates(installed: InstalledTemplatesMap): void {
  const checkboxes = document.querySelectorAll<HTMLInputElement>(".template-checkbox");

  checkboxes.forEach((checkbox) => {
    // Use the stored template data if available
    const templateData = (checkbox as any).templateData as TemplateFileData | undefined;

    if (templateData) {
      const installedList = installed[templateData.type as keyof InstalledTemplatesMap] || [];
      const isInstalled = installedList.includes(templateData.name);

      // Only update if the state has changed to prevent flickering
      if (checkbox.checked !== isInstalled) {
        checkbox.checked = isInstalled;
      }

      // Re-enable checkbox if it was disabled (after operation completes)
      checkbox.disabled = false;
    } else {
      // Fallback: parse from ID if template data not available (shouldn't happen normally)
      const idParts = checkbox.id.replace("template-", "").split("::");
      if (idParts.length === 3) {
        const [repository, type, name] = idParts;
        const installedList = installed[type as keyof InstalledTemplatesMap] || [];
        const isInstalled = installedList.includes(name);

        if (checkbox.checked !== isInstalled) {
          checkbox.checked = isInstalled;
        }
        checkbox.disabled = false;
      }
    }
  });
}
