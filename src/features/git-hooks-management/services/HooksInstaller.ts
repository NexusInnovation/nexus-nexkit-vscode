import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, spawn } from 'child_process';
import { getWorkspaceRoot } from '../../../shared/utils/fileHelper';

/**
 * Installs and manages git hook scripts in .githooks folder
 * Handles cross-platform compatibility (Windows/Unix)
 */
export class HooksInstaller {
  private static readonly HOOKS_DIR = '.githooks';
  private static readonly LIB_DIR = 'lib';

  /**
   * Check if git hooks are already installed
   */
  public isInstalled(): boolean {
    const hooksPath = this.getHooksPath();
    return fs.existsSync(hooksPath);
  }

  /**
   * Check if Python is available in PATH
   */
  public async checkPythonAvailable(): Promise<boolean> {
    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      execSync(`${cmd} ${pythonCmd}`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Install git hooks - creates .githooks folder with all scripts
   */
  public async install(): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      throw new Error('No workspace root found');
    }

    const hooksPath = this.getHooksPath();
    const libPath = path.join(hooksPath, HooksInstaller.LIB_DIR);

    // Create directories
    await fs.promises.mkdir(libPath, { recursive: true });

    // Write hook scripts
    await this._writePrePushHook(hooksPath);
    await this._writeCommitMsgHook(hooksPath);

    // Write Python libraries
    await this._writePythonLibraries(libPath);

    // Create scope.txt template
    await this._writeScopeTemplate(hooksPath);

    // Set executable permissions on Unix-like systems
    if (process.platform !== 'win32') {
      execSync(`chmod +x "${path.join(hooksPath, 'pre-push')}"`, { stdio: 'pipe' });
      execSync(`chmod +x "${path.join(hooksPath, 'commit-msg')}"`, { stdio: 'pipe' });
    }

    // Configure git to use .githooks
    await this._configureGitHooksPath(workspaceRoot);
  }

  /**
   * Get the path to .githooks folder
   */
  private getHooksPath(): string {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      throw new Error('No workspace root found');
    }
    return path.join(workspaceRoot, HooksInstaller.HOOKS_DIR);
  }

  /**
   * Write pre-push hook script
   */
  private async _writePrePushHook(hooksPath: string): Promise<void> {
    const script = `#!/usr/bin/env bash
#
# Pre-push hook: validates branch name against the "branch_name_pattern" rule
# defined in the GitHub ruleset exported to githooks-rulesets.json.
#
# This is a CLIENT-SIDE validation that mirrors the server-side rule,
# to detect violations before GitHub rejects the push.
# GitHub remains the source of truth.

set -euo pipefail

HOOK_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel)"
RULESET_FILE="$REPO_ROOT/githooks-rulesets.json"
CHECK_SCRIPT="$HOOK_DIR/lib/check_pattern.py"
SCOPE_FILE="$HOOK_DIR/scope.txt"
SCOPE_SCRIPT="$HOOK_DIR/lib/path_in_scope.py"

branch="$(git symbolic-ref --short -q HEAD || true)"

# Detached HEAD (e.g., CI): nothing to validate.
if [ -z "$branch" ]; then
  exit 0
fi

PYTHON_BIN=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then
    version_output="$("$candidate" --version 2>&1 || true)"
    # On Windows, "python3"/"python" may point to Microsoft Store stub.
    # Only accept if it responds as real Python.
    if [[ "$version_output" == Python\\ [23]* ]]; then
      PYTHON_BIN="$candidate"
      break
    fi
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  echo "⚠️  python not found — branch name validation skipped (GitHub rules still apply server-side)." >&2
  exit 0
fi

# Scope filtering: if .githooks/scope.txt defines patterns and
# no files modified by this branch (vs. default branch) match them,
# the rule is ignored.
base_ref="$(git merge-base HEAD origin/HEAD 2>/dev/null || true)"
if [ -z "$base_ref" ]; then
  base_ref="$(git merge-base HEAD origin/main 2>/dev/null || true)"
fi

if [ -n "$base_ref" ] && [ "$base_ref" != "$(git rev-parse HEAD)" ]; then
  changed_files=()
  while IFS= read -r f; do
    [ -n "$f" ] && changed_files+=("$f")
  done < <(git diff --name-only "$base_ref" HEAD)

  if ! "$PYTHON_BIN" "$SCOPE_SCRIPT" "$SCOPE_FILE" \${changed_files[@]+"\${changed_files[@]}"}; then
    exit 0
  fi
fi

set +e
message="$("$PYTHON_BIN" "$CHECK_SCRIPT" "$RULESET_FILE" "branch_name_pattern" "$branch" 2>&1)"
code=$?
set -e

case "$code" in
  0)
    exit 0
    ;;
  1)
    {
      echo ""
      echo "❌ Push rejected: branch name '$branch' violates 'branch_name_pattern' rule."
      echo "   $message"
      echo "   (source: $(basename "$RULESET_FILE"))"
      echo ""
      echo "   Rename your branch, e.g.: git branch -m squad/123-my-feature"
      echo ""
    } >&2
    exit 1
    ;;
  *)
    echo "⚠️  $message" >&2
    exit 0
    ;;
esac
`;

    await fs.promises.writeFile(path.join(hooksPath, 'pre-push'), script, 'utf8');
  }

  /**
   * Write commit-msg hook script
   */
  private async _writeCommitMsgHook(hooksPath: string): Promise<void> {
    const script = `#!/usr/bin/env bash
#
# commit-msg hook: validates the commit subject (first line) against
# the "commit_message_pattern" rule defined in the GitHub ruleset
# exported to githooks-rulesets.json.
#
# This is a CLIENT-SIDE validation that mirrors the server-side rule,
# to detect violations before GitHub rejects the commit.
# GitHub remains the source of truth.

set -euo pipefail

HOOK_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel)"
RULESET_FILE="$REPO_ROOT/githooks-rulesets.json"
CHECK_SCRIPT="$HOOK_DIR/lib/check_pattern.py"
SCOPE_FILE="$HOOK_DIR/scope.txt"
SCOPE_SCRIPT="$HOOK_DIR/lib/path_in_scope.py"
MSG_FILE="$1"

subject="$(head -n1 "$MSG_FILE")"

# Ignore auto-generated commits (merge, revert, fixup, squash).
if [[ "$subject" =~ ^(Merge|Revert|fixup!|squash!) ]]; then
  exit 0
fi

PYTHON_BIN=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then
    version_output="$("$candidate" --version 2>&1 || true)"
    # On Windows, "python3"/"python" may point to Microsoft Store stub.
    # Only accept if it responds as real Python.
    if [[ "$version_output" == Python\\ [23]* ]]; then
      PYTHON_BIN="$candidate"
      break
    fi
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  echo "⚠️  python not found — commit message validation skipped (GitHub rules still apply server-side)." >&2
  exit 0
fi

# Scope filtering: if .githooks/scope.txt defines patterns and
# no files in this commit match them, the rule is ignored.
changed_files=()
while IFS= read -r f; do
  [ -n "$f" ] && changed_files+=("$f")
done < <(git diff --cached --name-only --diff-filter=ACMR)

if ! "$PYTHON_BIN" "$SCOPE_SCRIPT" "$SCOPE_FILE" \${changed_files[@]+"\${changed_files[@]}"}; then
  exit 0
fi

set +e
message="$("$PYTHON_BIN" "$CHECK_SCRIPT" "$RULESET_FILE" "commit_message_pattern" "$subject" 2>&1)"
code=$?
set -e

case "$code" in
  0)
    exit 0
    ;;
  1)
    {
      echo ""
      echo "❌ Commit rejected: message '$subject' violates 'commit_message_pattern' rule."
      echo "   $message"
      echo "   (source: $(basename "$RULESET_FILE"))"
      echo ""
    } >&2
    exit 1
    ;;
  *)
    echo "⚠️  $message" >&2
    exit 0
    ;;
esac
`;

    await fs.promises.writeFile(path.join(hooksPath, 'commit-msg'), script, 'utf8');
  }

  /**
   * Write Python validation libraries
   */
  private async _writePythonLibraries(libPath: string): Promise<void> {
    // Write check_pattern.py
    const checkPatternScript = `#!/usr/bin/env python3
"""Validates a value (branch name, commit message, etc.) against a pattern rule
from a GitHub ruleset exported as JSON (e.g., githooks-rulesets.json).

This client-side validation faithfully reproduces the semantics of GitHub's
*_pattern rules (branch_name_pattern, commit_message_pattern, ...):
    - operator: "regex" | "starts_with" | "ends_with" | "contains"
    - pattern: the string/regex to compare
    - negate: if true, the rule passes when the value does NOT match

Semantics applied locally:
    - regex/contains: match if re.search(pattern, value) finds a match
    - starts_with: match if a regex match starts at index 0
    - ends_with: match if a regex match ends at index len(value)

Usage:
    check_pattern.py <ruleset.json> <rule_type> <value>

Exit codes:
    0 - value complies with the rule (or rule/file is absent -> nothing to validate)
    1 - value violates the rule (explanatory message on stderr)
    2 - unexpected error (message on stderr) - should not block caller
"""
import json
import re
import sys


def _sample(text: str, max_len: int = 80) -> str:
    if len(text) <= max_len:
        return text
    return f"{text[:max_len]}..."


def _match_details(match: re.Match[str] | None) -> str:
    if match is None:
        return "no match"
    return (
        f"span={match.span()}, start={match.start()}, end={match.end()}, "
        f"group0={match.group(0)!r}"
    )


def _build_failure_diagnostic(
    rule_type: str,
    operator: str,
    pattern: str,
    negate: bool,
    value: str,
    raw_matched: bool,
    final_matched: bool,
    regex_first_match: re.Match[str] | None,
    starts_with_match: re.Match[str] | None,
    ends_with_match: re.Match[str] | None,
) -> str:
    """Builds enriched diagnostics. Must never throw and never change semantics."""
    lines: list[str] = [
        "pattern validation failed:",
        f"  rule_type: {rule_type}",
        f"  operator: {operator}",
        f"  pattern: {pattern!r}",
        f"  negate: {negate}",
        f"  tested value: {value!r}",
        f"  tested value length: {len(value)}",
        f"  raw match result (before negate): {raw_matched}",
        f"  final match result (after negate): {final_matched}",
        f"  regex first search detail: {_match_details(regex_first_match)}",
    ]

    if operator == "regex":
        lines.append("  regex condition: re.search(pattern, value) is not None")

    elif operator == "starts_with":
        lines.append("  starts_with condition: a regex match must start at index 0")
        lines.append(f"  starts_with boundary match detail: {_match_details(starts_with_match)}")
        if regex_first_match is not None:
            lines.append(f"  starts_with boundary check: first_match.start() == 0 -> {regex_first_match.start() == 0}")

    elif operator == "ends_with":
        lines.append("  ends_with condition: a regex match must end at index len(value)")
        lines.append(f"  ends_with boundary target index: {len(value)}")
        lines.append(f"  ends_with boundary match detail: {_match_details(ends_with_match)}")
        if regex_first_match is not None:
            lines.append(
                f"  ends_with boundary check (first match): "
                f"first_match.end() == len(value) -> {regex_first_match.end() == len(value)}"
            )

    elif operator == "contains":
        lines.append("  contains condition: re.search(pattern, value) is not None")

    return "\\n".join(lines)


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: check_pattern.py <ruleset.json> <rule_type> <value>", file=sys.stderr)
        return 2

    ruleset_path, rule_type, value = sys.argv[1], sys.argv[2], sys.argv[3]

    try:
        with open(ruleset_path, "r", encoding="utf-8") as f:
            ruleset = json.load(f)
    except FileNotFoundError:
        # No ruleset file: nothing to validate locally.
        return 0
    except json.JSONDecodeError as exc:
        print(f"WARN: {ruleset_path} is not valid JSON ({exc}) - validation ignored", file=sys.stderr)
        return 0

    rules = ruleset.get("rules", [])
    rule = next((r for r in rules if r.get("type") == rule_type), None)
    if rule is None:
        # This ruleset does not define this rule: nothing to validate locally.
        return 0

    params = rule.get("parameters", {})
    operator = params.get("operator", "regex")
    pattern = params.get("pattern", "")
    negate = bool(params.get("negate", False))

    regex_first_match = None
    starts_with_match = None
    ends_with_match = None
    try:
        regex_first_match = re.search(pattern, value)

        if operator == "regex":
            raw_matched = regex_first_match is not None
        elif operator == "starts_with":
            if regex_first_match is not None and regex_first_match.start() == 0:
                starts_with_match = regex_first_match
            raw_matched = starts_with_match is not None
        elif operator == "ends_with":
            if regex_first_match is not None and regex_first_match.end() == len(value):
                ends_with_match = regex_first_match
            else:
                for candidate in re.finditer(pattern, value):
                    if candidate.end() == len(value):
                        ends_with_match = candidate
                        break
            raw_matched = ends_with_match is not None
        elif operator == "contains":
            raw_matched = regex_first_match is not None
        else:
            print(f"WARN: operator '{operator}' not supported for '{rule_type}' - validation ignored", file=sys.stderr)
            return 0
    except re.error as exc:
        print(f"WARN: invalid regex pattern for '{rule_type}' ({exc}) - validation ignored", file=sys.stderr)
        return 0

    final_matched = (not raw_matched) if negate else raw_matched

    if final_matched:
        return 0

    try:
        diagnostic = _build_failure_diagnostic(
            rule_type=rule_type,
            operator=operator,
            pattern=pattern,
            negate=negate,
            value=value,
            raw_matched=raw_matched,
            final_matched=final_matched,
            regex_first_match=regex_first_match,
            starts_with_match=starts_with_match,
            ends_with_match=ends_with_match,
        )
    except Exception as exc:  # pragma: no cover - diagnostic guardrail
        verb = "must NOT match" if negate else "must match"
        diagnostic = (
            f"'{value}' {verb} the pattern ({operator}): {pattern}\\n"
            f"diagnostic error (ignored): {exc}"
        )

    print(diagnostic, file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
`;

    await fs.promises.writeFile(path.join(libPath, 'check_pattern.py'), checkPatternScript, 'utf8');

    // Write path_in_scope.py
    const pathInScopeScript = `#!/usr/bin/env python3
"""Determines if at least one file path matches a "scope" pattern
(directories affected by validation hooks).

Usage:
    path_in_scope.py <scope_file> [path ...]

Semantics:
    - If <scope_file> is absent, empty, or contains no active patterns
      (excluding blank lines / comments "#"), validation applies to the
      ENTIRE repository: exit code 0 (in scope) regardless of paths provided.
    - Otherwise, exit 0 as soon as at least one path matches at least one
      pattern (fnmatch: "*" also matches "/"), else 1.

Exit codes:
    0 - in scope (the rule should apply)
    1 - out of scope (the rule may be ignored)
"""
import fnmatch
import sys


def load_patterns(scope_file: str) -> list[str]:
    try:
        with open(scope_file, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except FileNotFoundError:
        return []

    patterns = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        patterns.append(line)
    return patterns


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: path_in_scope.py <scope_file> [path ...]", file=sys.stderr)
        return 1

    scope_file = sys.argv[1]
    paths = [p for p in sys.argv[2:] if p.strip()]

    patterns = load_patterns(scope_file)
    if not patterns:
        # No scope defined: the rule applies everywhere.
        return 0

    for path in paths:
        normalized = path.replace("\\\\", "/")
        for pattern in patterns:
            if fnmatch.fnmatch(normalized, pattern):
                return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
`;

    await fs.promises.writeFile(path.join(libPath, 'path_in_scope.py'), pathInScopeScript, 'utf8');

    // Set executable permissions on Unix-like systems
    if (process.platform !== 'win32') {
      execSync(`chmod +x "${path.join(libPath, 'check_pattern.py')}"`, { stdio: 'pipe' });
      execSync(`chmod +x "${path.join(libPath, 'path_in_scope.py')}"`, { stdio: 'pipe' });
    }
  }

  /**
   * Write scope.txt template
   */
  private async _writeScopeTemplate(hooksPath: string): Promise<void> {
    const template = `# Git hooks scope filter
# 
# By default, git hooks validation rules apply to the entire repository.
# To limit rules to specific directories (e.g., src/), add patterns below
# (one per line, using fnmatch syntax where * matches everything including /):
# 
# Example:
# src/*
# 
# Rules will be skipped if:
# - commit-msg: no files in the commit match a pattern
# - pre-push: no files modified by the branch (vs. origin/main) match a pattern
# 
# If this file is absent or empty, no filtering occurs.
`;

    await fs.promises.writeFile(path.join(hooksPath, 'scope.txt'), template, 'utf8');
  }

  /**
   * Configure git to use .githooks directory
   */
  private async _configureGitHooksPath(workspaceRoot: string): Promise<void> {
    try {
      execSync('git config core.hooksPath .githooks', {
        cwd: workspaceRoot,
        stdio: 'pipe',
      });
    } catch (error) {
      console.error('Error configuring git hooks path:', error);
      throw new Error('Failed to configure git to use .githooks directory');
    }
  }
}
