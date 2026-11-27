import { render } from "preact";
import { useMemo, useState } from "preact/hooks";
import { createRegExp, getHighlightSegments, PATTERN_PRESETS } from "../regexBuilder";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "8px",
  border: "1px solid var(--vscode-input-border)",
  background: "var(--vscode-input-background)",
  color: "var(--vscode-input-foreground)",
  fontFamily: "var(--vscode-editor-font-family)",
};

function App() {
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState("g");
  const [testText, setTestText] = useState("");
  const [replacement, setReplacement] = useState("");

  const result = useMemo(() => {
    try {
      return { expression: createRegExp(pattern, flags), error: "" };
    } catch (error) {
      return { expression: undefined, error: error instanceof Error ? error.message : String(error) };
    }
  }, [pattern, flags]);
  const segments = result.expression ? getHighlightSegments(testText, result.expression) : [];
  const matchCount = segments.filter((segment) => segment.isMatch).length;
  const replacementPreview = result.expression ? testText.replace(result.expression, replacement) : "";

  const applyPreset = (event: Event): void => {
    const preset = PATTERN_PRESETS.find((item) => item.name === (event.target as HTMLSelectElement).value);
    if (preset) {
      setPattern(preset.pattern);
      setFlags(preset.flags);
    }
  };

  return (
    <main style={{ padding: "12px", fontFamily: "var(--vscode-font-family)", color: "var(--vscode-foreground)" }}>
      <h2 style={{ marginTop: 0 }}>JavaScript RegEx Builder</h2>
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <label style={{ flex: 1 }}>
          Pattern
          <input aria-label="Regular expression pattern" value={pattern} onInput={(event) => setPattern((event.target as HTMLInputElement).value)} style={inputStyle} />
        </label>
        <label style={{ width: "100px" }}>
          Flags
          <input aria-label="Regular expression flags" value={flags} onInput={(event) => setFlags((event.target as HTMLInputElement).value)} style={inputStyle} />
        </label>
        <label style={{ width: "150px" }}>
          Insert pattern
          <select aria-label="Common patterns" onChange={applyPreset} style={inputStyle} defaultValue="">
            <option value="" disabled>Choose...</option>
            {PATTERN_PRESETS.map((preset) => <option value={preset.name}>{preset.name}</option>)}
          </select>
        </label>
      </div>
      {result.error ? <div role="alert" style={{ color: "var(--vscode-errorForeground)", marginBottom: "12px" }}>{result.error}</div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <label>
          Test text
          <textarea aria-label="Test text" value={testText} onInput={(event) => setTestText((event.target as HTMLTextAreaElement).value)} style={{ ...inputStyle, minHeight: "220px", resize: "vertical" }} />
        </label>
        <div>
          <div>Matches: {matchCount}</div>
          <pre aria-label="Match highlights" style={{ ...inputStyle, minHeight: "220px", margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {segments.map((segment, index) => segment.isMatch
              ? <mark key={index} style={{ background: "var(--vscode-editor-findMatchHighlightBackground)" }}>{segment.text}</mark>
              : segment.text)}
          </pre>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
        <label>
          Replacement
          <input aria-label="Replacement text" value={replacement} onInput={(event) => setReplacement((event.target as HTMLInputElement).value)} style={inputStyle} />
        </label>
        <label>
          Replace preview
          <textarea aria-label="Replace preview" value={replacementPreview} readOnly style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }} />
        </label>
      </div>
    </main>
  );
}

const root = window.document.getElementById("root");
if (root) {
  render(<App />, root);
}
