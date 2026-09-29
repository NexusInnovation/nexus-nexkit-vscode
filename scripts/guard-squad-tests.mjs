import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testSuiteRoot = path.join(root, "test", "suite");

const requiredFiles = [
  ["test", "suite", "squadDetectionService.test.ts"],
  ["test", "suite", "squadDetectionService.behavior.test.ts"],
  ["test", "suite", "squadProjectVersionReader.test.ts"],
  ["test", "suite", "squadProjectVersionReader.behavior.test.ts"],
  ["test", "suite", "helpers", "fakeSquadCli.ts"],
  ["test", "suite", "squadCliSimulated.test.ts"],
  ["test", "suite", "squadCliSimulatedFlows.test.ts"],
  ["test", "suite", "profileSquadIntegration.test.ts"],
];

const forbiddenPatterns = [
  {
    pattern: /\b(?:suite|test|describe|it)\s*\.\s*(?:skip|only)\s*\(/,
    message: "Squad tests must not be skipped or focused",
  },
  {
    pattern: /\bthis\s*\.\s*skip\s*\(/,
    message: "Squad tests must not skip at runtime",
  },
  {
    pattern: /\bfrom\s+["'](?:node:)?child_process["']|\brequire\s*\(\s*["'](?:node:)?child_process["']\s*\)/,
    message: "Squad tests must not import child_process; use FakeSquadCli or injected seams",
  },
  {
    pattern: /\b(?:spawn|exec|execFile)\s*\(/,
    message: "Squad tests must not spawn real CLI processes",
  },
  {
    pattern: /\bfetch\s*\(/,
    message: "Squad tests must not call real network fetch; inject fake providers instead",
  },
  {
    pattern: /\bhttps?\s*\.\s*(?:get|request)\s*\(/,
    message: "Squad tests must not call real network clients",
  },
];

const errors = [];

for (const parts of requiredFiles) {
  const absolutePath = path.join(root, ...parts);
  if (!existsSync(absolutePath)) {
    errors.push(`Missing protected Squad test artifact: ${parts.join("/")}`);
    continue;
  }

  if (statSync(absolutePath).size === 0) {
    errors.push(`Protected Squad test artifact is empty: ${parts.join("/")}`);
  }
}

for (const filePath of collectSquadSources(testSuiteRoot)) {
  const content = readFileSync(filePath, "utf8");
  const relativePath = path.relative(root, filePath).replaceAll(path.sep, "/");

  for (const { pattern, message } of forbiddenPatterns) {
    const match = pattern.exec(content);
    if (match) {
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      errors.push(`${relativePath}:${line} ${message}`);
    }
  }
}

if (errors.length > 0) {
  console.error("Squad test guard failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Squad test guard passed (${collectSquadSources(testSuiteRoot).length} source files checked).`);

function collectSquadSources(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSquadSources(absolutePath));
      continue;
    }

    const lowerName = entry.name.toLowerCase();
    if (
      entry.isFile() &&
      (lowerName.endsWith(".ts") || lowerName.endsWith(".tsx")) &&
      (lowerName.includes("squad") || path.basename(path.dirname(absolutePath)).toLowerCase().includes("squad"))
    ) {
      files.push(absolutePath);
    }
  }
  return files.sort();
}
