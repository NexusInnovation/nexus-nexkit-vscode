/**
 * Webview main entry point
 * Initializes the Preact application
 */

import { render } from "preact";
import { App } from "./components/App";

// Wait for DOM to be ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    render(<App />, document.body);
  });
} else {
  render(<App />, document.body);
}
