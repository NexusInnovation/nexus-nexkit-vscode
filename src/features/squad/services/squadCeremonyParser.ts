/**
 * Pure parser for `.squad/ceremonies.md` (SQD-047 / #262, PRD FR-055).
 *
 * The Squad CLI template lays out one `## <Name>` section per ceremony, each
 * with a `| Field | Value |` table and an `**Agenda:**` numbered list. The
 * parser is tolerant: unknown fields are ignored, missing fields stay
 * undefined, and sections without a field table are not treated as
 * ceremonies. It never touches the file system so it can be unit-tested in
 * isolation and reused by any reader.
 */

import { SQUAD_CEREMONIES_RELATIVE_PATH, SquadCeremony } from "../models";

type CeremonyField = "trigger" | "when" | "condition" | "facilitator" | "participants" | "timeBudget" | "enabled";

const FIELD_BY_LABEL: Record<string, CeremonyField> = {
  trigger: "trigger",
  when: "when",
  condition: "condition",
  facilitator: "facilitator",
  participants: "participants",
  "time budget": "timeBudget",
  timebudget: "timeBudget",
  enabled: "enabled",
};

/** Parse every ceremony section of a ceremonies markdown document. */
export function parseSquadCeremonies(markdown: string): SquadCeremony[] {
  const lines = markdown.split(/\r?\n/);
  const ceremonies: SquadCeremony[] = [];
  const usedIds = new Set<string>();

  let index = 0;
  while (index < lines.length) {
    const heading = /^##\s+(.+?)\s*#*\s*$/.exec(lines[index]);
    if (!heading) {
      index++;
      continue;
    }
    let end = index + 1;
    while (end < lines.length && !/^#{1,2}\s+/.test(lines[end])) {
      end++;
    }
    const ceremony = parseSection(heading[1].trim(), lines.slice(index + 1, end), usedIds);
    if (ceremony) {
      ceremonies.push(ceremony);
    }
    index = end;
  }

  return ceremonies;
}

/**
 * Build the chat prompt that asks the Squad coordinator to run a ceremony now.
 * Only ceremony metadata from the workspace file is included — no paths beyond
 * the conventional `.squad/ceremonies.md` reference.
 */
export function buildSquadCeremonyPrompt(ceremony: SquadCeremony): string {
  const lines = [`Run the "${ceremony.name}" ceremony defined in ${SQUAD_CEREMONIES_RELATIVE_PATH} now (manual trigger).`];
  if (ceremony.facilitator) {
    lines.push(`Facilitator: ${ceremony.facilitator}.`);
  }
  if (ceremony.participants) {
    lines.push(`Participants: ${ceremony.participants}.`);
  }
  if (ceremony.agenda.length > 0) {
    lines.push("Agenda:");
    ceremony.agenda.forEach((item, position) => lines.push(`${position + 1}. ${item}`));
  }
  lines.push("Follow the agenda, then summarize the outcome and action items.");
  return lines.join("\n");
}

function parseSection(name: string, body: string[], usedIds: Set<string>): SquadCeremony | undefined {
  const fields = parseFieldTable(body);
  if (!fields) {
    return undefined;
  }

  const ceremony: SquadCeremony = {
    id: uniqueId(slug(name) || "ceremony", usedIds),
    name,
    enabled: fields.enabled === undefined ? true : parseEnabled(fields.enabled),
    agenda: parseAgenda(body),
  };
  for (const key of ["trigger", "when", "condition", "facilitator", "participants", "timeBudget"] as const) {
    const value = fields[key];
    if (value !== undefined && value.length > 0) {
      ceremony[key] = value;
    }
  }
  return ceremony;
}

function parseFieldTable(body: string[]): Partial<Record<CeremonyField, string>> | undefined {
  const fields: Partial<Record<CeremonyField, string>> = {};
  let found = false;
  for (const raw of body) {
    const line = raw.trim();
    if (!line.startsWith("|")) {
      continue;
    }
    const cells = line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length < 2) {
      continue;
    }
    const field = FIELD_BY_LABEL[stripMarkdown(cells[0]).toLowerCase()];
    if (!field) {
      continue;
    }
    fields[field] = stripMarkdown(cells[1]);
    found = true;
  }
  return found ? fields : undefined;
}

function parseAgenda(body: string[]): string[] {
  const start = body.findIndex((line) => /^\s*\**\s*agenda\s*:?\s*\**\s*:?\s*$/i.test(line));
  if (start === -1) {
    return [];
  }
  const items: string[] = [];
  for (let i = start + 1; i < body.length; i++) {
    const line = body[i];
    const item = /^\s*(?:\d+[.)]|[-*+])\s+(.+)$/.exec(line);
    if (item) {
      items.push(stripMarkdown(item[1]));
      continue;
    }
    if (line.trim().length === 0 && items.length === 0) {
      continue;
    }
    break;
  }
  return items;
}

function parseEnabled(value: string): boolean {
  const normalized = value.toLowerCase();
  if (/❌|🚫|⛔/.test(value) || /\b(no|false|off|disabled)\b/.test(normalized)) {
    return false;
  }
  return true;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\*\*|__|`/g, "")
    .replace(/^\*(.*)\*$/, "$1")
    .trim();
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueId(base: string, usedIds: Set<string>): string {
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix++}`;
  }
  usedIds.add(id);
  return id;
}
