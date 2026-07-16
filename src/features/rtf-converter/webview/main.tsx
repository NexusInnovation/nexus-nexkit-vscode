import { render } from "preact";
import { useMemo, useState } from "preact/hooks";
import * as mammoth from "mammoth";
import MarkdownIt = require("markdown-it");
import TurndownService = require("turndown");
import { gfm } from "turndown-plugin-gfm";
import { Document as RtfDocument } from "rtf.js/dist/RTFJS.bundle.js";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

type ConversionSource = "paste" | "docx" | "rtf" | "text";

const CELL_BLOCK_SELECTOR = "p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre";

// GFM tables require each row on a single line and a header row; Word/Outlook
// HTML violates both (block elements inside cells, no <th>), so turndown-plugin-gfm
// either scatters pipes across lines or keeps the table as raw HTML.
const normalizeTablesForGfm = (html: string): string => {
  const parsedDocument = new DOMParser().parseFromString(html, "text/html");
  const tables = Array.from(parsedDocument.querySelectorAll("table"));
  if (tables.length === 0) {
    return html;
  }

  tables.forEach((table) => {
    table.querySelectorAll("th, td").forEach((cell) => {
      cell.querySelectorAll("br").forEach((lineBreak) => {
        lineBreak.replaceWith(parsedDocument.createTextNode(" "));
      });
      cell.querySelectorAll(CELL_BLOCK_SELECTOR).forEach((block) => {
        block.replaceWith(
          parsedDocument.createTextNode(" "),
          ...Array.from(block.childNodes),
          parsedDocument.createTextNode(" "),
        );
      });
    });

    const firstRow = table.rows[0];
    if (!firstRow) {
      return;
    }
    const hasHeaderRow =
      firstRow.parentElement?.tagName === "THEAD" ||
      Array.from(firstRow.cells).every((cell) => cell.tagName === "TH");
    if (!hasHeaderRow) {
      const headerSection = parsedDocument.createElement("thead");
      const headerRow = parsedDocument.createElement("tr");
      Array.from(firstRow.cells).forEach((cell) => {
        const headerCell = parsedDocument.createElement("th");
        headerCell.innerHTML = cell.innerHTML;
        headerRow.appendChild(headerCell);
      });
      headerSection.appendChild(headerRow);
      table.insertBefore(headerSection, table.firstChild);
      firstRow.remove();
    }
  });

  return parsedDocument.body.innerHTML;
};

function App() {
  const [inputValue, setInputValue] = useState("");
  const [markdownValue, setMarkdownValue] = useState("");
  const [statusMessage, setStatusMessage] = useState("Paste rich text or upload a .docx/.rtf file.");
  const [isConverting, setIsConverting] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const markdownRenderer = useMemo(() => new MarkdownIt({ html: false }), []);

  const turndownService = useMemo(() => {
    const service = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });
    service.use(gfm);
    return service;
  }, []);

  const convertHtmlToMarkdown = (html: string): string => {
    if (!html.trim()) {
      return "";
    }
    return turndownService.turndown(normalizeTablesForGfm(html));
  };

  const applyMarkdownResult = (markdown: string, source: ConversionSource): void => {
    setMarkdownValue(markdown);
    const normalizedSource = source === "docx" ? ".docx upload" : source === "rtf" ? ".rtf upload" : source;
    setStatusMessage(markdown ? `Converted from ${normalizedSource}.` : `No content was produced from ${normalizedSource}.`);
  };

  const handlePaste = (event: ClipboardEvent): void => {
    const clipboardData = event.clipboardData;
    if (!clipboardData) {
      return;
    }

    const html = clipboardData.getData("text/html");
    const plainText = clipboardData.getData("text/plain");

    if (html) {
      event.preventDefault();
      setInputValue(plainText || html);
      applyMarkdownResult(convertHtmlToMarkdown(html), "paste");
      return;
    }

    if (plainText) {
      event.preventDefault();
      setInputValue(plainText);
      applyMarkdownResult(plainText, "text");
    }
  };

  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (!(reader.result instanceof ArrayBuffer)) {
          reject(new Error("Unable to read file as ArrayBuffer."));
          return;
        }
        resolve(reader.result);
      };
      reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."));
      reader.readAsArrayBuffer(file);
    });

  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."));
      reader.readAsText(file);
    });

  const convertDocxToMarkdown = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    const { value } = await mammoth.convertToHtml({ arrayBuffer });
    return convertHtmlToMarkdown(value);
  };

  const convertRtfToMarkdown = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    const document = new RtfDocument(arrayBuffer, {});
    const renderedElements = await document.render();
    const container = window.document.createElement("div");
    renderedElements.forEach((element) => {
      container.appendChild(element);
    });
    return convertHtmlToMarkdown(container.innerHTML);
  };

  const handleFileUpload = async (event: Event): Promise<void> => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setStatusMessage("File is too large. Please use a file smaller than 10 MB.");
      target.value = "";
      return;
    }

    const extension = file.name.toLowerCase().split(".").pop();

    setIsConverting(true);
    try {
      if (extension === "docx") {
        setInputValue(`Uploaded file: ${file.name}`);
        const markdown = await convertDocxToMarkdown(await readFileAsArrayBuffer(file));
        applyMarkdownResult(markdown, "docx");
      } else if (extension === "rtf") {
        setInputValue(`Uploaded file: ${file.name}`);
        const markdown = await convertRtfToMarkdown(await readFileAsArrayBuffer(file));
        applyMarkdownResult(markdown, "rtf");
      } else {
        const text = await readFileAsText(file);
        setInputValue(text);
        applyMarkdownResult(text, "text");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Conversion failed: ${errorMessage}`);
    } finally {
      setIsConverting(false);
      target.value = "";
    }
  };

  const handleCopy = async (): Promise<void> => {
    if (!markdownValue) {
      return;
    }

    try {
      await navigator.clipboard.writeText(markdownValue);
      setStatusMessage("Markdown copied to clipboard.");
    } catch {
      const textArea = window.document.createElement("textarea");
      textArea.value = markdownValue;
      window.document.body.appendChild(textArea);
      textArea.select();
      window.document.execCommand("copy");
      window.document.body.removeChild(textArea);
      setStatusMessage("Markdown copied to clipboard.");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        padding: "12px",
        boxSizing: "border-box",
        fontFamily: "var(--vscode-font-family)",
        color: "var(--vscode-foreground)",
        background: "var(--vscode-editor-background)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", gap: "8px" }}>
        <strong>RTF / HTML / DOCX to Markdown</strong>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label
            style={{
              border: "1px solid var(--vscode-button-border)",
              padding: "4px 8px",
              borderRadius: "4px",
              cursor: "pointer",
              background: "var(--vscode-button-background)",
              color: "var(--vscode-button-foreground)",
            }}
          >
            Upload file
            <input
              type="file"
              accept=".docx,.rtf,.txt,.html,.htm,text/rtf,application/rtf"
              onChange={(event) => void handleFileUpload(event)}
              style={{ display: "none" }}
            />
          </label>
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={!markdownValue}
            style={{
              border: "1px solid var(--vscode-button-border)",
              padding: "4px 8px",
              borderRadius: "4px",
              cursor: markdownValue ? "pointer" : "not-allowed",
              background: "var(--vscode-button-background)",
              color: "var(--vscode-button-foreground)",
              opacity: markdownValue ? "1" : "0.6",
            }}
          >
            Copy Markdown
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <label style={{ marginBottom: "6px" }}>Input (paste Word/Outlook content or upload a file)</label>
          <textarea
            value={inputValue}
            onInput={(event) => {
              const value = (event.target as HTMLTextAreaElement).value;
              setInputValue(value);
              applyMarkdownResult(value, "text");
            }}
            onPaste={(event) => handlePaste(event as ClipboardEvent)}
            placeholder="Paste rich text here..."
            style={{
              width: "100%",
              minHeight: "220px",
              flex: 1,
              resize: "vertical",
              padding: "8px",
              boxSizing: "border-box",
              border: "1px solid var(--vscode-input-border)",
              background: "var(--vscode-input-background)",
              color: "var(--vscode-input-foreground)",
              fontFamily: "var(--vscode-editor-font-family)",
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", gap: "8px" }}>
            <label>Markdown output</label>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
              <span>Preview</span>
              <input
                type="checkbox"
                role="switch"
                checked={isPreviewMode}
                onChange={(event) => setIsPreviewMode((event.target as HTMLInputElement).checked)}
                aria-label="Toggle rendered Markdown preview"
              />
            </label>
          </div>
          {isPreviewMode ? (
            <div
              aria-label="Rendered Markdown preview"
              style={{
                width: "100%",
                minHeight: "220px",
                flex: 1,
                overflow: "auto",
                padding: "8px",
                boxSizing: "border-box",
                border: "1px solid var(--vscode-input-border)",
                background: "var(--vscode-editor-background)",
                color: "var(--vscode-editor-foreground)",
              }}
              dangerouslySetInnerHTML={{ __html: markdownRenderer.render(markdownValue) }}
            />
          ) : (
            <textarea
              value={markdownValue}
              readOnly
              placeholder="Converted markdown appears here..."
              style={{
                width: "100%",
                minHeight: "220px",
                flex: 1,
                resize: "vertical",
                padding: "8px",
                boxSizing: "border-box",
                border: "1px solid var(--vscode-input-border)",
                background: "var(--vscode-editor-background)",
                color: "var(--vscode-editor-foreground)",
                fontFamily: "var(--vscode-editor-font-family)",
              }}
            />
          )}
        </div>
      </div>

      <div style={{ marginTop: "8px", color: "var(--vscode-descriptionForeground)" }}>
        {isConverting ? "Converting file..." : statusMessage} (.rtf conversion is best-effort.)
      </div>
    </div>
  );
}

function renderApp() {
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
