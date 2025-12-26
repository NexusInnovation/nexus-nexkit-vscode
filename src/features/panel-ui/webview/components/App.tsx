import { ActionsSection } from "./organisms/ActionsSection";
import { TemplateSection } from "./organisms/TemplateSection";

/**
 * Root component for the Nexkit webview panel
 */
export function App() {
  return (
    <div class="container">
      <ActionsSection />
      <TemplateSection />
    </div>
  );
}
