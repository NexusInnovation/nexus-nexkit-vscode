import * as fs from "fs";
import * as vscode from "vscode";
import { LoggingService } from "../../shared/services/loggingService";
import { BuildLogLine, parseLogLine } from "./buildLogParser";
import { describeRecord, findNextStep, isTimelineActive } from "./buildMapper";
import { DevOpsBuildsClient, DevOpsProjectRef } from "./devOpsBuildsClient";

const POLL_INTERVAL_MS = 3_000;
const FOCUS_COMMAND = "nexkit.buildLog.focus";

export type BuildLogHostMessage =
  { type: "reset"; title: string } | { type: "lines"; lines: BuildLogLine[] } | { type: "status"; text: string; live: boolean };

interface LogSession {
  ref: DevOpsProjectRef;
  buildId: number;
  buildNumber: string;
  recordId: string;
  cancelled: boolean;
}

/**
 * Dedicated bottom-panel view showing the log of ONE build job/step, live while it runs.
 * When the shown step was still running, the view moves to the next step as soon as it completes.
 */
export class BuildLogViewService implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly VIEW_ID = "nexkit.buildLog";

  private _view?: vscode.WebviewView;
  private _session?: LogSession;
  private _wake?: () => void;
  private _timer?: NodeJS.Timeout;

  // What the view currently shows, replayed whenever the webview (re)loads
  private _title = "";
  private _lines: BuildLogLine[] = [];
  private _status: { text: string; live: boolean } = { text: "", live: false };

  public constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _client: DevOpsBuildsClient,
    private readonly _logging: LoggingService
  ) {}

  public resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, "out")] };

    const listener = view.webview.onDidReceiveMessage((message: { type?: string }) => {
      if (message.type === "ready") {
        this._replay();
      }
    });
    view.onDidDispose(() => {
      listener.dispose();
      this._view = undefined;
    });

    void this._buildHtml(view.webview).then((html) => {
      view.webview.html = html;
    });
  }

  /** Shows the log of a job/step, replacing whatever was displayed */
  public async open(ref: DevOpsProjectRef, buildId: number, buildNumber: string, recordId: string): Promise<void> {
    this._stopSession();
    const session: LogSession = { ref, buildId, buildNumber, recordId, cancelled: false };
    this._session = session;
    this._reset(`Build #${buildNumber}`);
    this._setStatus("Loading…", true);

    // Revealing creates the view on first use; the webview then asks for a replay
    await vscode.commands.executeCommand(FOCUS_COMMAND);
    await this._run(session);
  }

  public dispose(): void {
    this._stopSession();
  }

  private _stopSession(): void {
    if (this._session) {
      this._session.cancelled = true;
    }
    this._session = undefined;
    this._wake?.();
    this._wake = undefined;
  }

  private async _run(session: LogSession): Promise<void> {
    let nextLine = 1;
    let following: boolean | undefined;
    let shownTitle = false;

    while (!session.cancelled) {
      let finished = false;
      let moveOn = false;
      try {
        // The state is read before the lines: a finished record guarantees the lines are complete
        const timeline = await this._client.getTimeline(session.ref, session.buildId);
        const record = describeRecord(timeline, session.recordId);
        if (session.cancelled) {
          return;
        }
        if (!record) {
          this._setStatus("This step is not part of the build.", false);
          return;
        }

        following ??= record.type === "Task" && !record.finished;
        if (!shownTitle) {
          this._reset(`Build #${session.buildNumber} • ${record.name}`);
          shownTitle = true;
        }

        if (record.logId !== undefined) {
          const lines = await this._client.getLogLines(session.ref, session.buildId, record.logId, nextLine);
          if (session.cancelled) {
            return;
          }
          nextLine += lines.length;
          this._append(lines);
        }

        finished = record.finished;
        if (!finished) {
          this._setStatus(record.logId === undefined ? "Waiting for the step to start…" : "Live", true);
        } else if (following) {
          const next = findNextStep(timeline, session.recordId);
          if (next) {
            session.recordId = next.id;
            nextLine = 1;
            shownTitle = false;
            moveOn = true;
          } else if (isTimelineActive(timeline)) {
            this._setStatus("Waiting for the next step…", true);
            finished = false;
          }
        }
      } catch (error) {
        this._logging.warn(`Could not load log for build ${session.buildId}`, error);
        this._setStatus(`Unable to load the log: ${error instanceof Error ? error.message : "unexpected error"}`, false);
        return;
      }

      if (finished && !moveOn) {
        this._setStatus(this._lines.length === 0 ? "No log available for this step." : "End of log", false);
        return;
      }
      if (!moveOn) {
        await this._sleep(POLL_INTERVAL_MS);
      }
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this._wake = resolve;
      this._timer = setTimeout(resolve, ms);
    }).then(() => {
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = undefined;
      }
      this._wake = undefined;
    });
  }

  private _reset(title: string): void {
    this._title = title;
    this._lines = [];
    this._post({ type: "reset", title });
  }

  private _append(rawLines: string[]): void {
    const lines = rawLines.map(parseLogLine).filter((line): line is BuildLogLine => line !== undefined);
    if (lines.length === 0) {
      return;
    }
    this._lines.push(...lines);
    this._post({ type: "lines", lines });
  }

  private _setStatus(text: string, live: boolean): void {
    this._status = { text, live };
    this._post({ type: "status", text, live });
  }

  private _replay(): void {
    if (!this._title) {
      return;
    }
    this._post({ type: "reset", title: this._title });
    if (this._lines.length > 0) {
      this._post({ type: "lines", lines: this._lines });
    }
    this._post({ type: "status", ...this._status });
  }

  private _post(message: BuildLogHostMessage): void {
    void this._view?.webview.postMessage(message);
  }

  private async _buildHtml(webview: vscode.Webview): Promise<string> {
    const htmlPath = vscode.Uri.joinPath(this._extensionUri, "out", "devops-build-log", "index.html");
    try {
      const html = await fs.promises.readFile(htmlPath.fsPath, "utf8");
      return html.replace(/\{\{nonce\}\}/g, this._getNonce()).replace(/\{\{cspSource\}\}/g, webview.cspSource);
    } catch (error) {
      this._logging.error(`Failed to read build log webview HTML at ${htmlPath.fsPath}`, error);
      return "<!DOCTYPE html><html><body><p>Unable to load the build log view. Please rebuild the extension.</p></body></html>";
    }
  }

  private _getNonce(): string {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let text = "";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
