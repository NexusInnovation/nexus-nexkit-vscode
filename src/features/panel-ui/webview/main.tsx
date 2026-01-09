import { render } from "preact";
import { App } from "./components/App";
import { AppStateProvider } from "./contexts/AppStateContext";

// Wait for DOM to be ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    render(
      <AppStateProvider>
        <App />
      </AppStateProvider>,
      document.body
    );
  });
} else {
  render(
    <AppStateProvider>
      <App />
    </AppStateProvider>,
    document.body
  );
}
