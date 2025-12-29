import { useEffect } from "preact/hooks";
import { useVSCodeAPI } from "../hooks/useVSCodeAPI";
import { ActionsSection } from "./organisms/ActionsSection";
import { TemplateSection } from "./organisms/TemplateSection";

/**
 * Root component for the Nexkit webview panel
 */
export function App() {
  const messenger = useVSCodeAPI();

  useEffect(() => {
      // Request initial state from extension
      messenger.sendMessage({ command: "webviewReady" });
    }, [messenger]);

  return (
    <div class="container">
      <ActionsSection />
      <TemplateSection />
    </div>
  );
}
