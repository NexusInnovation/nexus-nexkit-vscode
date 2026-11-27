export interface PatternPreset {
  readonly name: string;
  readonly pattern: string;
  readonly flags: string;
}

export interface HighlightSegment {
  readonly text: string;
  readonly isMatch: boolean;
}

export const PATTERN_PRESETS: readonly PatternPreset[] = [
  { name: "Email", pattern: "[^\\s@]+@[^\\s@]+\\.[^\\s@]+", flags: "g" },
  { name: "URL", pattern: "https?:\\/\\/[^\\s]+", flags: "g" },
  { name: "IPv4 address", pattern: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b", flags: "g" },
  { name: "UUID", pattern: "\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b", flags: "gi" },
  { name: "ISO date", pattern: "\\b\\d{4}-\\d{2}-\\d{2}\\b", flags: "g" },
] as const;

export function createRegExp(pattern: string, flags: string): RegExp {
  return new RegExp(pattern, flags);
}

export function getHighlightSegments(text: string, expression: RegExp): HighlightSegment[] {
  const matcher = new RegExp(expression.source, expression.flags.includes("g") ? expression.flags : `${expression.flags}g`);
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(matcher)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ text: text.slice(cursor, index), isMatch: false });
    }
    segments.push({ text: match[0], isMatch: true });
    cursor = index + match[0].length;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isMatch: false });
  }

  return segments;
}
