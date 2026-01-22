import { render } from "preact";
import { App } from "./components/App";
import { AppStateProvider } from "./contexts/AppStateContext";

function renderApp() {
  render(
    <AppStateProvider>
      <App />
    </AppStateProvider>,
    document.body
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderApp);
} else {
  renderApp();
}
