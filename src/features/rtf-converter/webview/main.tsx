import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import * as mammoth from "mammoth";
import MarkdownIt = require("markdown-it");
import TurndownService = require("turndown");
import { gfm } from "turndown-plugin-gfm";
import { Document as RtfDocument } from "rtf.js/dist/RTFJS.bundle.js";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

type ConversionSource = "paste" | "docx" | "rtf" | "html" | "text";

const CELL_BLOCK_SELECTOR = "p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre";

const UNSAFE_ELEMENT_SELECTOR = "script, style, iframe, object, embed, link, meta, base, form";

const isUnsafeUrl = (value: string): boolean => /^\s*(?:javascript|vbscript):/i.test(value);

const sanitizeHtml = (html: string): string => {
  const parsedDocument = new DOMParser().parseFromString(html, "text/html");
  parsedDocument.querySelectorAll(UNSAFE_ELEMENT_SELECTOR).forEach((element) => element.remove());

  parsedDocument.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const attributeName = attribute.name.toLowerCase();
      if (
        attributeName.startsWith("on") ||
        attributeName === "srcdoc" ||
        ((attributeName === "href" || attributeName === "src") && isUnsafeUrl(attribute.value))
      ) {
        element.removeAttribute(attribute.name);
      }

      if (attributeName === "style" && /(?:expression\s*\(|url\s*\(|@import|behavior\s*:|-moz-binding)/i.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  return parsedDocument.body.innerHTML;
};

const plainTextToHtml = (text: string): string => {
  const container = window.document.createElement("div");
  container.textContent = text;
  return container.innerHTML.replace(/\r?\n/g, "<br>");
};

const rtfTextToArrayBuffer = (rtf: string): ArrayBuffer => {
  const bytes = new Uint8Array(rtf.length);
  for (let index = 0; index < rtf.length; index++) {
    bytes[index] = rtf.charCodeAt(index);
  }
  return bytes.buffer;
};

const normalizeClipboardHtml = (html: string): string => {
  const parsedDocument = new DOMParser().parseFromString(html, "text/html");
  parsedDocument.querySelectorAll<HTMLElement>("*").forEach((element) => {
    element.removeAttribute("class");
    element.removeAttribute("style");
  });
  return parsedDocument.body.innerHTML;
};

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
          parsedDocument.createTextNode(" ")
        );
      });
    });

    const firstRow = table.rows[0];
    if (!firstRow) {
      return;
    }
    const hasHeaderRow =
      firstRow.parentElement?.tagName === "THEAD" || Array.from(firstRow.cells).every((cell) => cell.tagName === "TH");
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

const isGfmTableLine = (line: string): boolean => /^\s*\|.*\|\s*$/.test(line);

const isGfmTableSeparator = (line: string): boolean => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

const getGfmTableCells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());

const formatGfmTable = (lines: string[]): string[] => {
  const rows = lines.filter((line) => !isGfmTableSeparator(line)).map(getGfmTableCells);
  const columnCount = Math.max(...rows.map((row) => row.length));
  const widths = Array.from({ length: columnCount }, (_, columnIndex) =>
    Math.max(3, ...rows.map((row) => row[columnIndex]?.length ?? 0))
  );

  const formatRow = (row: string[]): string =>
    `| ${widths.map((width, columnIndex) => (row[columnIndex] ?? "").padEnd(width)).join(" | ")} |`;
  const separator = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;

  return [formatRow(rows[0]), separator, ...rows.slice(1).map(formatRow)];
};

const getListType = (line: string): "ordered" | "unordered" | undefined => {
  if (/^\s*-\s/u.test(line)) {
    return "unordered";
  }
  if (/^\s*\d+\.\s/u.test(line)) {
    return "ordered";
  }
  return undefined;
};

const removeBlankLinesBetweenListItems = (lines: string[]): string[] =>
  lines.filter((line, lineIndex) => {
    if (line) {
      return true;
    }

    const previousLine = lines
      .slice(0, lineIndex)
      .reverse()
      .find((candidate) => candidate !== "");
    const nextLine = lines.slice(lineIndex + 1).find((candidate) => candidate !== "");
    const previousListType = previousLine ? getListType(previousLine) : undefined;
    const nextListType = nextLine ? getListType(nextLine) : undefined;
    return !previousListType || previousListType !== nextListType;
  });

const normalizeMarkdown = (markdown: string): string => {
  const normalizedLines = removeBlankLinesBetweenListItems(
    markdown
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) =>
        line
          .replace(/^(\s*)[•·◦▪‣*-][\s\u00a0]*/u, "$1- ")
          .replace(/^(\s*)\d+\\?\.[\s\u00a0]*/u, "$11. ")
          .replace(/[\t\u00a0]+/gu, " ")
          .replace(/[ ]+$/u, "")
      )
  );

  const formattedLines: string[] = [];
  for (let lineIndex = 0; lineIndex < normalizedLines.length; lineIndex++) {
    if (!isGfmTableLine(normalizedLines[lineIndex])) {
      formattedLines.push(normalizedLines[lineIndex]);
      continue;
    }

    const tableLines: string[] = [];
    while (lineIndex < normalizedLines.length && isGfmTableLine(normalizedLines[lineIndex])) {
      tableLines.push(normalizedLines[lineIndex]);
      lineIndex++;
    }
    formattedLines.push(...formatGfmTable(tableLines));
    lineIndex--;
  }

  return formattedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

function App() {
  const [inputHtml, setInputHtml] = useState("");
  const [markdownValue, setMarkdownValue] = useState("");
  const [statusMessage, setStatusMessage] = useState("Paste rich text or upload a .docx/.rtf file.");
  const [isConverting, setIsConverting] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const sourceEditorRef = useRef<HTMLDivElement>(null);

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
    return normalizeMarkdown(turndownService.turndown(normalizeTablesForGfm(html)));
  };

  useEffect(() => {
    if (sourceEditorRef.current && sourceEditorRef.current.innerHTML !== inputHtml) {
      sourceEditorRef.current.innerHTML = inputHtml;
    }
  }, [inputHtml]);

  const applyMarkdownResult = (markdown: string, source: ConversionSource): void => {
    setMarkdownValue(markdown);
    const normalizedSource =
      source === "docx" ? ".docx upload" : source === "rtf" ? ".rtf upload" : source === "html" ? ".html upload" : source;
    setStatusMessage(markdown ? `Converted from ${normalizedSource}.` : `No content was produced from ${normalizedSource}.`);
  };

  const applyRichContent = (html: string, source: ConversionSource): void => {
    const sanitizedHtml = sanitizeHtml(html);
    setInputHtml(sanitizedHtml);
    applyMarkdownResult(convertHtmlToMarkdown(sanitizedHtml), source);
  };

  const applyPlainText = (text: string): void => {
    setInputHtml(plainTextToHtml(text));
    applyMarkdownResult(text, "text");
  };

  const convertDocxToHtml = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    const { value } = await mammoth.convertToHtml({ arrayBuffer });
    return value;
  };

  const convertRtfToHtml = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    const document = new RtfDocument(arrayBuffer, {});
    const renderedElements = await document.render();
    const container = window.document.createElement("div");
    renderedElements.forEach((element) => {
      container.appendChild(element);
    });
    return container.innerHTML;
  };

  const handleFile = async (file: File): Promise<void> => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setStatusMessage("File is too large. Please use a file smaller than 10 MB.");
      return;
    }

    const extension = file.name.toLowerCase().split(".").pop();
    setIsConverting(true);
    try {
      if (extension === "docx") {
        applyRichContent(await convertDocxToHtml(await readFileAsArrayBuffer(file)), "docx");
      } else if (extension === "rtf") {
        applyRichContent(await convertRtfToHtml(await readFileAsArrayBuffer(file)), "rtf");
      } else if (extension === "html" || extension === "htm") {
        applyRichContent(await readFileAsText(file), "html");
      } else {
        applyPlainText(await readFileAsText(file));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Conversion failed: ${errorMessage}`);
    } finally {
      setIsConverting(false);
    }
  };

  const handlePaste = async (event: ClipboardEvent): Promise<void> => {
    const clipboardData = event.clipboardData;
    if (!clipboardData) {
      return;
    }

    const html = clipboardData.getData("text/html");
    const rtf = clipboardData.getData("text/rtf");
    const plainText = clipboardData.getData("text/plain");

    const file = Array.from(clipboardData.files).find((clipboardFile) => clipboardFile.size > 0);
    if (file) {
      event.preventDefault();
      await handleFile(file);
      return;
    }

    if (html) {
      event.preventDefault();
      applyRichContent(normalizeClipboardHtml(html), "paste");
      return;
    }

    if (rtf) {
      event.preventDefault();
      setIsConverting(true);
      try {
        applyRichContent(await convertRtfToHtml(rtfTextToArrayBuffer(rtf)), "rtf");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setStatusMessage(`Conversion failed: ${errorMessage}`);
      } finally {
        setIsConverting(false);
      }
      return;
    }

    if (plainText) {
      event.preventDefault();
      applyPlainText(plainText);
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

  const handleFileUpload = async (event: Event): Promise<void> => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) {
      return;
    }

    try {
      await handleFile(file);
    } finally {
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
          <div
            ref={sourceEditorRef}
            class="rich-text-editor"
            contentEditable
            role="textbox"
            aria-multiline="true"
            aria-label="Rich text input"
            onInput={(event) => {
              const html = sanitizeHtml((event.currentTarget as HTMLDivElement).innerHTML);
              setInputHtml(html);
              applyMarkdownResult(convertHtmlToMarkdown(html), "paste");
            }}
            onPaste={(event) => void handlePaste(event as ClipboardEvent)}
            data-placeholder="Paste rich text here..."
            style={{
              width: "100%",
              minHeight: "220px",
              flex: 1,
              resize: "vertical",
              overflow: "auto",
              padding: "8px",
              boxSizing: "border-box",
              border: "1px solid var(--vscode-input-border)",
              background: "var(--vscode-input-background)",
              color: "var(--vscode-input-foreground)",
              fontFamily: "var(--vscode-font-family)",
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", gap: "8px" }}
          >
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
