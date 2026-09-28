import { render } from "preact";
import { App } from "./components/App";
import { AppStateProvider } from "./contexts/AppStateContext";

function renderApp() {
  // Render into #root and drop the static boot skeleton from index.html; fall
  // back to <body> if the template predates the #root container.
  const root = document.getElementById("root") ?? document.body;
  if (root.id === "root") {
    root.textContent = "";
  }
  render(
    <AppStateProvider>
      <App />
    </AppStateProvider>,
    root
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderApp);
} else {
  renderApp();
}
