import { useVSCodeAPI } from "../../hooks/useVSCodeAPI";

/**
 * Footer section component with feedback button
 */
export function FooterSection() {
  const messenger = useVSCodeAPI();

  const handleFeedbackClick = () => {
    messenger.sendMessage({ command: "openFeedback" });
  };

  const getExtensionVersion = (): string => {
    return (window as any).__NEXKIT_VERSION__ || "unknown";
  };

  return (
    <footer class="footer-section">
      <button type="button" class="feedback-button" onClick={handleFeedbackClick} title="Send feedback or report an issue">
        <i class="codicon codicon-feedback"></i>
        <span>Send Feedback</span>
      </button>
      <div class="footer-info">
        <span class="footer-version">Nexkit v{getExtensionVersion()}</span>
      </div>
    </footer>
  );
}
