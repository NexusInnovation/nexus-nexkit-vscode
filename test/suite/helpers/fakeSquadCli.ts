/**
 * Shared simulated Squad CLI for unit tests (SQD-041).
 *
 * {@link FakeSquadCli} implements the {@link SquadProcessRunner} seam, so it
 * can sit behind the *real* allowlisted {@link SquadCliService}: argv
 * construction, allowlist enforcement, timeouts and error mapping all run for
 * real while no process is ever spawned and no network is touched.
 *
 * Responses are scripted per Squad argv prefix (the `npx --yes <package>`
 * launcher prefix is stripped, so routes read like the CLI surface:
 * `["upstream", "add"]`). Any invocation with no scripted response is recorded
 * in {@link FakeSquadCli.unexpectedCalls} and fails with exit code 127, so an
 * unscripted command can never be mistaken for a success.
 *
 * This file is a helper, not a test suite: it does not match `*.test.js`.
 */

import * as path from "path";
import { SquadCliSource } from "../../../src/features/squad/models";
import {
  SQUAD_CLI_NPX_PACKAGE,
  SquadCliService,
  type SquadCliServiceOptions,
} from "../../../src/features/squad/services/squadCliService";
import type {
  SquadProcessRunner,
  SquadSpawnRequest,
  SquadSpawnResult,
} from "../../../src/features/squad/services/squadProcessRunner";
import type { LoggingService } from "../../../src/shared/services/loggingService";

/** Logger that swallows everything, for services under test. */
export const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as LoggingService;

/** A recorded invocation of the simulated CLI. */
export interface FakeSquadCliCall {
  /** The raw spawn request the service handed to the runner. */
  request: SquadSpawnRequest;

  /** The Squad argv with any `npx --yes <package>` launcher prefix removed. */
  squadArgs: string[];
}

/** A scripted (partial) process outcome; unspecified fields default to a clean exit 0. */
export type FakeSquadCliResponse = Partial<SquadSpawnResult>;

/** A dynamic response computed from the call (may be async, e.g. to hang). */
export type FakeSquadCliHandler = (call: FakeSquadCliCall) => FakeSquadCliResponse | Promise<FakeSquadCliResponse>;

interface FakeSquadCliRoute {
  prefix: readonly string[];
  handler: FakeSquadCliHandler;
  once: boolean;
}

/** Exit code returned for invocations that have no scripted response. */
export const FAKE_SQUAD_UNEXPECTED_EXIT_CODE = 127;

/** Canned process outcomes mirroring what `ChildProcessSquadRunner` reports. */
export const fakeSquadReply = {
  /** Clean exit 0 with the given output. */
  ok(stdout = "", stderr = ""): FakeSquadCliResponse {
    return { stdout, stderr, exitCode: 0 };
  },

  /** Non-zero exit (the CLI reported an error). */
  fail(exitCode = 1, stderr = "", stdout = ""): FakeSquadCliResponse {
    return { stdout, stderr, exitCode };
  },

  /** Process killed by the runner's timeout. */
  timeout(stdout = "", stderr = ""): FakeSquadCliResponse {
    return { stdout, stderr, exitCode: null, timedOut: true };
  },

  /** Executable could not be spawned (e.g. `ENOENT` when the CLI is missing). */
  notFound(spawnErrorCode = "ENOENT"): FakeSquadCliResponse {
    return { exitCode: null, spawnErrorCode };
  },

  /** Process killed because the caller cancelled. */
  cancelled(): FakeSquadCliResponse {
    return { exitCode: null, cancelled: true };
  },

  /**
   * A process that never exits on its own. Like the real runner, it settles as
   * `cancelled` when the request token fires, or `timedOut` once the request's
   * `timeoutMs` elapses — so tests exercise the real timeout/cancel plumbing
   * with a short `timeoutMs` instead of hand-crafting the flags.
   */
  hang(): FakeSquadCliHandler {
    return ({ request }) =>
      new Promise<FakeSquadCliResponse>((resolve) => {
        let timer: NodeJS.Timeout | undefined;
        let subscription: { dispose(): unknown } | undefined;
        let settled = false;
        const settle = (response: FakeSquadCliResponse): void => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          subscription?.dispose();
          resolve(response);
        };
        timer = setTimeout(() => settle({ exitCode: null, timedOut: true }), request.timeoutMs);
        subscription = request.token?.onCancellationRequested(() => settle({ exitCode: null, cancelled: true }));
        if (request.token?.isCancellationRequested) {
          settle({ exitCode: null, cancelled: true });
        }
      });
  },
} as const;

/**
 * Strip the `npx --yes @bradygaster/squad-cli` launcher prefix so the returned
 * argv is what the Squad CLI itself receives.
 */
export function squadArgsOf(request: SquadSpawnRequest): string[] {
  const executable = path.basename(request.command).toLowerCase().replace(/\.(cmd|exe)$/, "");
  const args = [...request.args];
  if (executable === "npx" && args[0] === "--yes" && args[1] === SQUAD_CLI_NPX_PACKAGE) {
    return args.slice(2);
  }
  return args;
}

/** Scriptable, recording fake of the Squad CLI process layer. */
export class FakeSquadCli implements SquadProcessRunner {
  /** Every invocation, in order (including unexpected ones). */
  public readonly calls: FakeSquadCliCall[] = [];

  /** Invocations that matched no scripted response. */
  public readonly unexpectedCalls: FakeSquadCliCall[] = [];

  private readonly _routes: FakeSquadCliRoute[] = [];

  /**
   * Script a response for every call whose Squad argv starts with `prefix`.
   * Later registrations take precedence over earlier ones; `[]` matches all.
   */
  public on(prefix: readonly string[], reply: FakeSquadCliResponse | FakeSquadCliHandler): this {
    this._routes.push({ prefix, handler: toHandler(reply), once: false });
    return this;
  }

  /** Like {@link on}, but the response is consumed by the first matching call. */
  public once(prefix: readonly string[], reply: FakeSquadCliResponse | FakeSquadCliHandler): this {
    this._routes.push({ prefix, handler: toHandler(reply), once: true });
    return this;
  }

  /** Number of simulated process launches. */
  public get spawnCount(): number {
    return this.calls.length;
  }

  /** The most recent invocation, if any. */
  public get lastCall(): FakeSquadCliCall | undefined {
    return this.calls[this.calls.length - 1];
  }

  /** {@link SquadProcessRunner} implementation — records the call and replays the script. */
  public async run(request: SquadSpawnRequest): Promise<SquadSpawnResult> {
    const call: FakeSquadCliCall = {
      request: { ...request, args: [...request.args] },
      squadArgs: squadArgsOf(request),
    };
    this.calls.push(call);

    const index = this._findRoute(call.squadArgs);
    if (index < 0) {
      this.unexpectedCalls.push(call);
      return complete({
        exitCode: FAKE_SQUAD_UNEXPECTED_EXIT_CODE,
        stderr: `fake-squad: no simulated response for \`squad ${call.squadArgs.join(" ")}\``,
      });
    }

    const route = this._routes[index];
    if (route.once) {
      this._routes.splice(index, 1);
    }
    return complete(await route.handler(call));
  }

  /**
   * Build a real {@link SquadCliService} wired to this fake. Defaults to the
   * `global` source so no settings are read; override via `options`.
   */
  public createService(options: Omit<SquadCliServiceOptions, "runner"> = {}): SquadCliService {
    return new SquadCliService({
      logger: silentLogger,
      cliSource: SquadCliSource.Global,
      ...options,
      runner: this,
    });
  }

  private _findRoute(squadArgs: readonly string[]): number {
    for (let i = this._routes.length - 1; i >= 0; i--) {
      const { prefix } = this._routes[i];
      if (prefix.length <= squadArgs.length && prefix.every((part, j) => squadArgs[j] === part)) {
        return i;
      }
    }
    return -1;
  }
}

function toHandler(reply: FakeSquadCliResponse | FakeSquadCliHandler): FakeSquadCliHandler {
  return typeof reply === "function" ? reply : () => reply;
}

function complete(response: FakeSquadCliResponse): SquadSpawnResult {
  return { stdout: "", stderr: "", exitCode: 0, timedOut: false, cancelled: false, ...response };
}
