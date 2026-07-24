const fs = require("fs");
const path = require("path");

const root = process.cwd();
const requiredFiles = [
  "quality/EXPLORATION.md",
  "quality/QUALITY.md",
  "quality/REQUIREMENTS.md",
  "quality/CONTRACTS.md",
  "quality/COVERAGE_MATRIX.md",
  "quality/COMPLETENESS_REPORT.md",
  "quality/test_functional.ts",
  "quality/test_regression.js",
  "quality/RUN_CODE_REVIEW.md",
  "quality/RUN_INTEGRATION_TESTS.md",
  "quality/RUN_SPEC_AUDIT.md",
  "quality/RUN_TDD_TESTS.md",
  "quality/BUGS.md",
  "quality/PROGRESS.md",
  "quality/run_state.jsonl",
  "quality/results/tdd-results.json",
  "quality/bugs_manifest.json",
  "quality/TDD_TRACEABILITY.md",
  "quality/citation_semantic_check.json",
  "quality/results/run-2026-07-24T02-08-30.json",
  "quality/code_reviews/2026-07-24-pass3-summary.md",
  "quality/spec_audits/2026-07-24-triage.md",
];

const optionalFiles = [
  "quality/INDEX.md",
  "quality/exploration_role_map.json",
  "quality/results/integration-results.json",
];

const jsonFiles = [
  "quality/requirements_manifest.json",
  "quality/use_cases_manifest.json",
  "quality/bugs_manifest.json",
  "quality/results/tdd-results.json",
  "quality/citation_semantic_check.json",
  "quality/results/run-2026-07-24T02-08-30.json",
  "quality/formal_docs_manifest.json",
];

const findings = { errors: [], warnings: [], info: [] };

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

for (const rel of requiredFiles) {
  if (!exists(rel)) {
    findings.errors.push(`Missing required artifact: ${rel}`);
  }
}

for (const rel of optionalFiles) {
  if (!exists(rel)) {
    findings.warnings.push(`Optional/canonical artifact missing: ${rel}`);
  }
}

for (const rel of jsonFiles) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    findings.errors.push(`Missing JSON artifact: ${rel}`);
    continue;
  }
  try {
    JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (err) {
    findings.errors.push(`Invalid JSON in ${rel}: ${String(err.message || err)}`);
  }
}

const bugsPath = path.join(root, "quality", "BUGS.md");
const tddPath = path.join(root, "quality", "results", "tdd-results.json");
if (fs.existsSync(bugsPath) && fs.existsSync(tddPath)) {
  const bugText = fs.readFileSync(bugsPath, "utf8");
  const tdd = JSON.parse(fs.readFileSync(tddPath, "utf8"));
  const bugIds = [...bugText.matchAll(/##\s+(BUG-\d+)/g)].map((m) => m[1]);
  const tddIds = (tdd.bugs || []).map((b) => b.id);
  if (bugIds.length !== tddIds.length) {
    findings.errors.push(`BUGS.md count (${bugIds.length}) != tdd-results count (${tddIds.length})`);
  }
  for (const id of bugIds) {
    if (!tddIds.includes(id)) {
      findings.errors.push(`Bug missing from tdd-results.json: ${id}`);
    }
    const redLog = path.join(root, "quality", "results", `${id}.red.log`);
    if (!fs.existsSync(redLog)) {
      findings.errors.push(`Missing red log for ${id}: quality/results/${id}.red.log`);
    }
  }
}

const metadataPath = path.join(root, "quality", "results", "run-2026-07-24T02-08-30.json");
if (fs.existsSync(metadataPath)) {
  const meta = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  if (!Array.isArray(meta.phases_completed) || !meta.phases_completed.includes("Phase 5")) {
    findings.errors.push("Run metadata missing Phase 5 in phases_completed");
  }
  if (meta.gate_result == null) {
    findings.warnings.push("Run metadata gate_result is null");
  }
}

console.log("# Mechanical Verify");
console.log(`Errors: ${findings.errors.length}`);
console.log(`Warnings: ${findings.warnings.length}`);
console.log(`Info: ${findings.info.length}`);

for (const e of findings.errors) console.log(`ERROR: ${e}`);
for (const w of findings.warnings) console.log(`WARN: ${w}`);
for (const i of findings.info) console.log(`INFO: ${i}`);

const exitCode = findings.errors.length > 0 ? 1 : 0;
process.exitCode = exitCode;
