import { render } from "preact";
import { useMemo, useState } from "preact/hooks";
import { CRON_PRESETS, describeCronSchedule } from "./cronSchedule";

function App() {
  const [expression, setExpression] = useState("*/5 * * * *");
  const result = useMemo(() => describeCronSchedule(expression), [expression]);

  const copyExpression = async (): Promise<void> => {
    if (result.error) {
      return;
    }
    await navigator.clipboard.writeText(result.expression);
  };

  return (
    <main
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "24px",
        color: "var(--vscode-foreground)",
        fontFamily: "var(--vscode-font-family)",
      }}
    >
      <h1>Cron Job Schedule Builder</h1>
      <p>Enter a standard 5-field cron expression or a 6-field expression with seconds.</p>

      <label htmlFor="cron-expression" style={{ display: "block", fontWeight: "bold", marginBottom: "6px" }}>
        Cron expression
      </label>
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          id="cron-expression"
          value={expression}
          onInput={(event) => setExpression((event.target as HTMLInputElement).value)}
          spellCheck={false}
          aria-describedby="cron-help cron-result"
          style={{
            flex: 1,
            padding: "8px",
            border: "1px solid var(--vscode-input-border)",
            background: "var(--vscode-input-background)",
            color: "var(--vscode-input-foreground)",
            fontFamily: "var(--vscode-editor-font-family)",
          }}
        />
        <button type="button" onClick={() => void copyExpression()} disabled={Boolean(result.error)}>
          Copy
        </button>
      </div>
      <p id="cron-help" style={{ color: "var(--vscode-descriptionForeground)" }}>
        5 fields: minute hour day-of-month month day-of-week. 6 fields: second minute hour day-of-month month day-of-week.
      </p>

      <section
        id="cron-result"
        aria-live="polite"
        style={{
          padding: "12px",
          border: `1px solid ${result.error ? "var(--vscode-inputValidation-errorBorder)" : "var(--vscode-inputOption-activeBorder)"}`,
          background: result.error
            ? "var(--vscode-inputValidation-errorBackground)"
            : "var(--vscode-inputOption-activeBackground)",
        }}
      >
        {result.error ? (
          <strong>{result.error}</strong>
        ) : (
          <>
            <strong>{result.description}</strong>
            <div style={{ marginTop: "6px" }}>
              Valid {result.fieldCount}-field cron expression{result.fieldCount === 6 ? " with seconds" : ""}.
            </div>
          </>
        )}
      </section>

      <section style={{ marginTop: "24px" }}>
        <h2>Common schedules</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {CRON_PRESETS.map((preset) => (
            <button type="button" onClick={() => setExpression(preset.expression)}>
              {preset.label}
            </button>
          ))}
        </div>
      </section>
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
