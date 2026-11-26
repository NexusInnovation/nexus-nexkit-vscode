export type BuildLogLineKind = "plain" | "error" | "warning" | "section" | "command" | "debug" | "group";

export interface BuildLogLine {
  /** HH:mm:ss, empty when the raw line carries no timestamp */
  time: string;
  kind: BuildLogLineKind;
  text: string;
}

const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})(?:\.\d+)?Z ?([\s\S]*)$/;
const DIRECTIVE_PATTERN = /^##\[(\w+)\]([\s\S]*)$/;
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const DIRECTIVE_KINDS: Record<string, BuildLogLineKind> = {
  error: "error",
  warning: "warning",
  section: "section",
  command: "command",
  debug: "debug",
  group: "group",
};

/**
 * Parses one raw Azure DevOps log line.
 * Returns undefined for lines that carry no visible content (group terminators).
 */
export function parseLogLine(raw: string): BuildLogLine | undefined {
  let time = "";
  let text = raw;
  const stamped = TIMESTAMP_PATTERN.exec(raw);
  if (stamped) {
    time = stamped[1];
    text = stamped[2];
  }

  text = text.replace(ANSI_PATTERN, "");
  let kind: BuildLogLineKind = "plain";

  const directive = DIRECTIVE_PATTERN.exec(text);
  if (directive) {
    const name = directive[1].toLowerCase();
    if (name === "endgroup") {
      return undefined;
    }
    const mapped = DIRECTIVE_KINDS[name];
    if (mapped) {
      kind = mapped;
      text = directive[2];
    }
  }

  return { time, kind, text };
}
