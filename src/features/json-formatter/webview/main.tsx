import { render } from "preact";
import { useState } from "preact/hooks";
import { formatJson } from "../jsonFormatter";

declare function acquireVsCodeApi(): { postMessage(message: { command: "copy" | "save"; formattedJson: string }): void };

const vscode = acquireVsCodeApi();

function App() {
  const [inputValue, setInputValue] = useState("");
  const [formattedValue, setFormattedValue] = useState("");
  const [statusMessage, setStatusMessage] = useState("Enter JSON, JSONC, or JSON5 to validate and format it.");

  const handleInput = (value: string): void => {
    setInputValue(value);

    if (!value.trim()) {
      setFormattedValue("");
      setStatusMessage("Enter JSON, JSONC, or JSON5 to validate and format it.");
      return;
    }

    const result = formatJson(value);
    if ("error" in result) {
      setFormattedValue("");
      setStatusMessage(`Line ${result.error.line}, column ${result.error.column}: ${result.error.message}`);
      return;
    }

    setFormattedValue(result.formattedJson);
    setStatusMessage("Valid JSON. Output is formatted with two-space indentation.");
  };

  const sendAction = (command: "copy" | "save"): void => {
    if (!formattedValue) {
      return;
    }
    vscode.postMessage({ command, formattedJson: formattedValue });
  };

  return (
    <main class="formatter">
      <header class="toolbar">
        <h1>JSON Formatter</h1>
        <div class="actions">
          <button type="button" onClick={() => sendAction("copy")} disabled={!formattedValue}>
            Copy
          </button>
          <button type="button" onClick={() => sendAction("save")} disabled={!formattedValue}>
            Save
          </button>
        </div>
      </header>

      <section class="editor-grid" aria-label="JSON formatter editors">
        <label class="editor-panel">
          <span>Input</span>
          <textarea
            value={inputValue}
            onInput={(event) => handleInput((event.target as HTMLTextAreaElement).value)}
            placeholder="Paste JSON, JSONC, or JSON5 here..."
            spellcheck={false}
            aria-label="JSON input"
          />
        </label>
        <label class="editor-panel">
          <span>Formatted JSON</span>
          <textarea
            value={formattedValue}
            readOnly
            placeholder="Validated formatted JSON appears here..."
            spellcheck={false}
            aria-label="Formatted JSON output"
          />
        </label>
      </section>

      <p class={formattedValue ? "status valid" : inputValue.trim() ? "status" : "status empty"} role="status">
        {statusMessage}
      </p>
    </main>
  );
}

function renderApp(): void {
  const root = window.document.getElementById("root");
  if (root) {
    render(<App />, root);
  }
}

if (window.document.readyState === "loading") {
  window.document.addEventListener("DOMContentLoaded", renderApp);
} else {
  renderApp();
}