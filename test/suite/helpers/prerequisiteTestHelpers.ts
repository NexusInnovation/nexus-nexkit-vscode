/**
 * Shared test doubles and factories for the prerequisite-automation feature.
 *
 * The factories exist so a scripted process result stays a single readable line
 * at the call site: `ok()`, `ko()`, `crashed(2)`, `timedOut()`, `notFound()`.
 *
 * Nothing here executes a real script. The only suite that touches a real
 * interpreter is the opt-in integration suite.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
  IClock,
  IFileSystem,
  IPrerequisiteLogger,
  IProcessRunner,
  PrerequisiteError,
  ProcessRunOptions,
  ScriptRunResult,
} from "../../../src/features/prerequisite-automation/types";

// ---------------------------------------------------------------------------
// ScriptRunResult factories
// ---------------------------------------------------------------------------

const BASE: ScriptRunResult = {
  outcome: "completed",
  exitCode: 0,
  stdout: "",
  stderr: "",
  durationMs: 10,
  truncated: false,
};

/** The `::VALIDATED::` marker exactly as the reference scripts emit it. */
export function validatedMarker(validated: boolean): string {
  return `::VALIDATED::${validated ? "true" : "false"}`;
}

/** Success: exit 0, and (by default) a positive validation marker. */
export function ok(stdout = validatedMarker(true)): ScriptRunResult {
  return { ...BASE, outcome: "completed", exitCode: 0, stdout };
}

/** Clean negative answer: exit 1 with a negative marker. Not an error. */
export function ko(stdout = validatedMarker(false)): ScriptRunResult {
  return { ...BASE, outcome: "completed", exitCode: 1, stdout };
}

/** Completed with an unexpected exit code (outside the 0/1 script contract). */
export function crashed(exitCode = 2, stderr = ""): ScriptRunResult {
  return { ...BASE, outcome: "completed", exitCode, stderr };
}

/** The process exceeded its per-step timeout and was killed. */
export function timedOut(): ScriptRunResult {
  return { ...BASE, outcome: "timedOut", exitCode: null, durationMs: 60_000 };
}

/** The script file itself is absent. MUST NOT be confused with `ko()`. */
export function notFound(fileName = "script"): ScriptRunResult {
  return {
    ...BASE,
    outcome: "scriptNotFound",
    exitCode: null,
    durationMs: 0,
    failureReason: `${fileName} is missing.`,
  };
}

/** The interpreter could not be started at all. */
export function spawnFailed(reason = "ENOENT: spawn bash ENOENT"): ScriptRunResult {
  return { ...BASE, outcome: "spawnFailed", exitCode: null, durationMs: 0, failureReason: reason };
}

/** Completed with stderr content, for classification tests. */
export function withStderr(stderr: string, exitCode = 1): ScriptRunResult {
  return { ...BASE, outcome: "completed", exitCode, stderr };
}

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

export interface RecordedCall {
  command: string;
  args: string[];
  options: ProcessRunOptions;
}

/**
 * Records every spawn and answers from a matcher table.
 *
 * Matching is a substring test against `"<command> <args...>"`, so a rule can
 * key off an interpreter (`"jq"`) or a script filename (`"Check-Validation.ps1"`).
 */
export class FakeProcessRunner implements IProcessRunner {
  public readonly calls: RecordedCall[] = [];
  private readonly _rules: { matcher: string; results: ScriptRunResult[] }[] = [];
  private _fallback: ScriptRunResult = ok();

  /** Queue one or more results for invocations matching `matcher`, in order. */
  public respondTo(matcher: string, ...results: ScriptRunResult[]): this {
    const existing = this._rules.find((rule) => rule.matcher === matcher);
    if (existing) {
      existing.results.push(...results);
    } else {
      this._rules.push({ matcher, results: [...results] });
    }
    return this;
  }

  /**
   * Replace any rule for `matcher` and give it priority over pre-seeded rules.
   *
   * `respondTo` appends to an existing queue, which is what makes "run the same
   * step twice with different results" scriptable. A harness that pre-answers a
   * probe therefore cannot be contradicted by `respondTo` alone.
   */
  public overrideResponse(matcher: string, ...results: ScriptRunResult[]): this {
    const index = this._rules.findIndex((rule) => rule.matcher === matcher);
    if (index >= 0) {
      this._rules.splice(index, 1);
    }
    this._rules.unshift({ matcher, results: [...results] });
    return this;
  }

  /** Result used when no rule matches. */
  public fallback(result: ScriptRunResult): this {
    this._fallback = result;
    return this;
  }

  /** Every recorded invocation whose command line mentions `needle`. */
  public callsMatching(needle: string): RecordedCall[] {
    return this.calls.filter((call) => this._commandLine(call).includes(needle));
  }

  /** Invocations that ran an actual prerequisite script (probes excluded). */
  public get scriptCalls(): RecordedCall[] {
    return this.calls.filter((call) => /\.(ps1|sh)(\s|$)/.test(this._commandLine(call)));
  }

  public run(command: string, args: string[], options: ProcessRunOptions): Promise<ScriptRunResult> {
    this.calls.push({ command, args, options });

    const line = `${command} ${args.join(" ")}`;
    for (const rule of this._rules) {
      if (!line.includes(rule.matcher)) {
        continue;
      }
      // The last queued result repeats, so re-running the same step is scriptable.
      return Promise.resolve(rule.results.length > 1 ? (rule.results.shift() as ScriptRunResult) : rule.results[0]);
    }

    return Promise.resolve(this._fallback);
  }

  private _commandLine(call: RecordedCall): string {
    return `${call.command} ${call.args.join(" ")}`;
  }
}

/** In-memory filesystem. Every path not explicitly added is absent. */
export class FakeFileSystem implements IFileSystem {
  private readonly _files = new Map<string, string>();
  private readonly _realPaths = new Map<string, string>();

  public addFile(fsPath: string, contents = ""): this {
    this._files.set(fsPath, contents);
    return this;
  }

  public removeFile(fsPath: string): this {
    this._files.delete(fsPath);
    return this;
  }

  /** Simulates a symlink so containment can be re-asserted after resolution. */
  public setRealPath(fsPath: string, resolved: string): this {
    this._realPaths.set(fsPath, resolved);
    return this;
  }

  public fileExists(fsPath: string): Promise<boolean> {
    return Promise.resolve(this._files.has(fsPath));
  }

  public readTextFile(fsPath: string): Promise<string> {
    const contents = this._files.get(fsPath);
    if (contents === undefined) {
      return Promise.reject(new Error(`ENOENT: ${fsPath}`));
    }
    return Promise.resolve(contents);
  }

  public realPath(fsPath: string): Promise<string> {
    return Promise.resolve(this._realPaths.get(fsPath) ?? fsPath);
  }
}

/** Filesystem whose reads always fail, for the permission path. */
export class UnreadableFileSystem implements IFileSystem {
  public constructor(private readonly _existingPath: string) {}

  public fileExists(fsPath: string): Promise<boolean> {
    return Promise.resolve(fsPath === this._existingPath);
  }

  public readTextFile(): Promise<string> {
    return Promise.reject(new Error("EACCES: permission denied"));
  }

  public realPath(fsPath: string): Promise<string> {
    return Promise.resolve(fsPath);
  }
}

export interface LoggedEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  data?: unknown;
}

export class FakeLogger implements IPrerequisiteLogger {
  public readonly entries: LoggedEntry[] = [];

  public debug(message: string, data?: unknown): void {
    this.entries.push({ level: "debug", message, data });
  }
  public info(message: string, data?: unknown): void {
    this.entries.push({ level: "info", message, data });
  }
  public warn(message: string, data?: unknown): void {
    this.entries.push({ level: "warn", message, data });
  }
  public error(message: string, data?: unknown): void {
    this.entries.push({ level: "error", message, data });
  }

  public get messages(): string[] {
    return this.entries.map((entry) => entry.message);
  }

  public hasMessageContaining(needle: string): boolean {
    return this.messages.some((message) => message.includes(needle));
  }
}

/** Monotonic clock that advances a fixed amount per read. */
export class FakeClock implements IClock {
  private _now: number;

  public constructor(start = 1_000, private readonly _stepMs = 100) {
    this._now = start;
  }

  public now(): number {
    const current = this._now;
    this._now += this._stepMs;
    return current;
  }
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

const WINDOWS_ABSOLUTE = /[A-Za-z]:[\\/]/;
const POSIX_ABSOLUTE = /(^|[\s"'(])\/(?:usr|home|tmp|var|opt|etc|Users|private)\//;

/**
 * Fails when a user-facing string embeds an absolute local path.
 *
 * Mirrors the existing markitdown guard: diagnostics belong in the output
 * channel, never in a notification.
 */
export function assertNoAbsolutePaths(text: string, context: string): void {
  assert.ok(
    !WINDOWS_ABSOLUTE.test(text),
    `${context}: user-facing text leaked a Windows absolute path -> ${text}`
  );
  assert.ok(!POSIX_ABSOLUTE.test(text), `${context}: user-facing text leaked a POSIX absolute path -> ${text}`);
}

/**
 * Runs `action` and returns the thrown `PrerequisiteError`.
 *
 * Node's `assert.throws` returns `void`, so the error has to be captured
 * explicitly before its category and remediation can be asserted.
 */
export function captureError(action: () => unknown): PrerequisiteError {
  try {
    action();
  } catch (error) {
    assert.ok(error instanceof PrerequisiteError, `expected a PrerequisiteError, got ${String(error)}`);
    return error;
  }
  assert.fail("expected the call to throw a PrerequisiteError");
}

/** Async counterpart of {@link captureError}. */
export async function captureErrorAsync(action: () => Promise<unknown>): Promise<PrerequisiteError> {
  try {
    await action();
  } catch (error) {
    assert.ok(error instanceof PrerequisiteError, `expected a PrerequisiteError, got ${String(error)}`);
    return error;
  }
  assert.fail("expected the call to reject with a PrerequisiteError");
}

/**
 * Enforces the non-negotiable spawn rules on every recorded invocation:
 * arguments are always an array, and no shell is ever involved.
 */
export function assertSafeSpawns(runner: FakeProcessRunner): void {
  assert.ok(runner.calls.length > 0, "expected at least one recorded spawn");
  for (const call of runner.calls) {
    assert.ok(Array.isArray(call.args), `args must be an array for "${call.command}"`);
    assert.notStrictEqual(
      (call.options as unknown as { shell?: unknown }).shell,
      true,
      `shell must never be enabled for "${call.command}"`
    );
    assert.strictEqual(typeof call.command, "string");
    assert.ok(!call.command.includes("&&"), "the command must never carry a shell chain operator");
    assert.ok(!call.command.includes("|"), "the command must never carry a pipe");
  }
}

// ---------------------------------------------------------------------------
// URIs
// ---------------------------------------------------------------------------

/** Platform-appropriate absolute workspace root for URI-based assertions. */
export const WORKSPACE_ROOT: vscode.Uri = vscode.Uri.file(
  process.platform === "win32" ? "C:\\ws" : "/ws"
);

export function scriptsRootUri(root: vscode.Uri = WORKSPACE_ROOT, folder = "scripts"): vscode.Uri {
  return vscode.Uri.joinPath(root, folder);
}
