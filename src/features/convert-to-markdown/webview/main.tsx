import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import MarkdownIt = require("markdown-it");
import { WebviewToHostMessage, HostToWebviewMessage } from "../messages";

declare function acquireVsCodeApi(): { postMessage: (message: unknown) => void };

const vscode = acquireVsCodeApi();

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const md = new MarkdownIt({ html: false });

function postToHost(message: WebviewToHostMessage): void {
  vscode.postMessage(message);
}

function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsArrayBuffer(file);
  });
}

function App() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | undefined>(undefined);
  const [converting, setConverting] = useState(false);
  const [markdownValue, setMarkdownValue] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const fallbackTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<HostToWebviewMessage>): void => {
      const message = event.data;
      switch (message.type) {
        case "availability-status":
          setAvailable(message.available);
          setUnavailableReason(message.reason);
          break;
        case "conversion-result":
          setConverting(false);
          setMarkdownValue(message.markdown);
          setStatusMessage(`Converted from ${message.sourceLabel}.`);
          break;
        case "conversion-error":
          setConverting(false);
          setStatusMessage(`Conversion failed: ${message.message}`);
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    postToHost({ type: "webview-ready" });

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const isDisabled = available !== true || converting;

  const handleRecheck = (): void => {
    postToHost({ type: "recheck-availability" });
  };

  const sendFile = async (file: File): Promise<void> => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setStatusMessage("File is too large. Please use a file smaller than 10 MB.");
      return;
    }
    setConverting(true);
    setStatusMessage("Converting...");
    const data = await readFileAsUint8Array(file);
    postToHost({ type: "convert-file", fileName: file.name, data });
  };

  const handlePaste = (event: ClipboardEvent): void => {
    if (isDisabled) {
      return;
    }
    event.preventDefault();

    const clipboardData = event.clipboardData;
    if (!clipboardData) {
      return;
    }

    const html = clipboardData.getData("text/html");
    if (html) {
      setConverting(true);
      setStatusMessage("Converting...");
      postToHost({ type: "convert-paste-html", html });
      return;
    }

    const text = clipboardData.getData("text/plain");
    if (text) {
      setConverting(true);
      setStatusMessage("Converting...");
      postToHost({ type: "convert-paste-text", text });
      return;
    }

    const files = clipboardData.files;
    if (files && files.length > 0) {
      void sendFile(files[0]);
    }
  };

  const handleFileInputChange = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) {
      void sendFile(file);
    }
  };

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(markdownValue);
      setStatusMessage("Markdown copied to clipboard.");
      return;
    } catch {
      // Fall through to legacy fallback below.
    }

    const textarea = fallbackTextareaRef.current;
    if (!textarea) {
      setStatusMessage("Unable to copy to clipboard.");
      return;
    }

    textarea.value = markdownValue;
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand("copy");
      setStatusMessage("Markdown copied to clipboard.");
    } catch {
      setStatusMessage("Unable to copy to clipboard.");
    } finally {
      document.body.removeChild(textarea);
    }
  };

  return (
    <div
      style={{
        fontFamily: "var(--vscode-font-family)",
        color: "var(--vscode-foreground)",
        background: "var(--vscode-editor-background)",
        padding: "12px",
        height: "100vh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      {available !== true && (
        <div
          style={{
            border: "1px solid var(--vscode-inputValidation-warningBorder, orange)",
            background: "var(--vscode-inputValidation-warningBackground, transparent)",
            padding: "8px",
            borderRadius: "4px",
          }}
        >
          <p style={{ margin: 0 }}>
            Convert to Markdown requires Python and the <code>markitdown</code> package. Install:{" "}
            <code>pip install markitdown</code> (Python 3.10+, https://www.python.org/downloads/). If Python isn't on
            PATH, set the <code>nexkit.convertToMarkdown.pythonPath</code> setting.
          </p>
          {unavailableReason && <p style={{ margin: "4px 0 0 0" }}>{unavailableReason}</p>}
          <button onClick={handleRecheck}>Recheck</button>
        </div>
      )}

      <div
        onPaste={handlePaste}
        tabIndex={isDisabled ? -1 : 0}
        style={{
          border: "1px dashed var(--vscode-input-border, gray)",
          padding: "16px",
          textAlign: "center",
          opacity: isDisabled ? 0.5 : 1,
          pointerEvents: isDisabled ? "none" : "auto",
        }}
      >
        Click here and paste (Ctrl+V) content to convert.
      </div>

      <div>
        <input
          type="file"
          accept=".docx,.rtf,.html,.htm,.pptx,.pdf,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.bmp,.webp"
          disabled={isDisabled}
          onChange={handleFileInputChange}
        />
      </div>

      {statusMessage && <div>{statusMessage}</div>}

      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={() => setShowPreview(false)} disabled={!showPreview}>
          Markdown
        </button>
        <button onClick={() => setShowPreview(true)} disabled={showPreview || !markdownValue}>
          Preview
        </button>
        <button onClick={() => void handleCopy()} disabled={!markdownValue}>
          Copy
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {showPreview ? (
          <div dangerouslySetInnerHTML={{ __html: md.render(markdownValue) }} />
        ) : (
          <textarea
            value={markdownValue}
            readOnly
            style={{
              width: "100%",
              height: "100%",
              boxSizing: "border-box",
              background: "var(--vscode-input-background)",
              color: "var(--vscode-input-foreground)",
              border: "1px solid var(--vscode-input-border, transparent)",
            }}
          />
        )}
      </div>

      <textarea ref={fallbackTextareaRef} readOnly style={{ position: "absolute", left: "-9999px", top: "-9999px" }} />
    </div>
  );
}

render(<App />, document.getElementById("root")!);
