/**
 * Mode Selection Section Component
 * Displays when operation mode is None, prompting user to select a mode
 */

import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";
import { OperationMode } from "../../../../ai-template-files/models/aiTemplateFile";

/**
 * Mode selection section - shown when no mode is selected
 */
export function ModeSelectionSection() {
  const messenger = useVSCodeAPI();

  const handleSelectMode = (mode: OperationMode) => {
    messenger.sendMessage({
      command: "setMode",
      mode,
    });
  };

  return (
    <div class="mode-selection-container">
      <div class="mode-selection-header">
        <h2>Welcome to Nexkit</h2>
        <p>Please select your operation mode to get started</p>
      </div>

      <div class="mode-selection-cards">
        <button
          class="mode-card"
          onClick={() => handleSelectMode(OperationMode.Developers)}
          type="button"
        >
          <div class="mode-card-icon">
            <i class="codicon codicon-code"></i>
          </div>
          <div class="mode-card-content">
            <h3>Developers Mode</h3>
            <p>Full feature set for development teams</p>
            <ul class="mode-card-features">
              <li>Workspace initialization</li>
              <li>Profile management</li>
              <li>Template management</li>
              <li>Repository configuration</li>
            </ul>
          </div>
        </button>

        <button
          class="mode-card"
          onClick={() => handleSelectMode(OperationMode.APM)}
          type="button"
        >
          <div class="mode-card-icon">
            <i class="codicon codicon-dashboard"></i>
          </div>
          <div class="mode-card-content">
            <h3>APM Mode</h3>
            <p>Essential features for application management</p>
            <ul class="mode-card-features">
              <li>Template management</li>
              <li>Workspace initialization</li>
              <li>Azure DevOps integration</li>
              <li>Streamlined interface</li>
            </ul>
          </div>
        </button>
      </div>

      <div class="mode-selection-footer">
        <p class="mode-selection-note">
          <i class="codicon codicon-info"></i>
          You can change the mode later using the "Switch Mode" command
        </p>
      </div>
    </div>
  );
}
