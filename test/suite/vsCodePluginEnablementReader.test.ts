import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { MarketplacePluginReader } from "../../src/features/marketplace-management/marketplacePluginReader";
import { VsCodePluginEnablementReader } from "../../src/features/marketplace-management/vsCodePluginEnablementReader";

function loadSqlite():
  | {
      DatabaseSync: new (p: string) => {
        exec(sql: string): void;
        prepare(sql: string): { run(...a: unknown[]): void };
        close(): void;
      };
    }
  | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("node:sqlite");
  } catch {
    return undefined;
  }
}

suite("Unit: VsCodePluginEnablementReader", () => {
  const key = (p: string) => MarketplacePluginReader.pathKey(vscode.Uri.parse(p).fsPath);

  test("parseDisabled keeps only disabled entries (boolean and state-name forms)", () => {
    const disabled = VsCodePluginEnablementReader.parseDisabled(
      JSON.stringify([
        ["file:///c%3A/git/m/plugins/gl", false],
        ["file:///c%3A/git/m/plugins/core", true],
        ["file:///c%3A/git/m/plugins/ws", "DisabledWorkspace"],
        ["not-an-entry"],
        42,
      ])
    );

    assert.deepStrictEqual(
      [...disabled].sort(),
      [key("file:///c%3A/git/m/plugins/gl"), key("file:///c%3A/git/m/plugins/ws")].sort()
    );
  });

  test("parseDisabled tolerates invalid JSON", () => {
    assert.strictEqual(VsCodePluginEnablementReader.parseDisabled("{oops").size, 0);
  });

  test("returns undefined without a state database or sqlite support", () => {
    assert.strictEqual(new VsCodePluginEnablementReader(undefined).getDisabledKeys(), undefined);
    assert.strictEqual(new VsCodePluginEnablementReader("x.vscdb", () => undefined).getDisabledKeys(), undefined);
  });

  test("reads agentPlugins.enablement from a VS Code state database", async function () {
    const sqlite = loadSqlite();
    if (!sqlite) {
      this.skip();
    }
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nexkit-state-"));
    const dbPath = path.join(dir, "state.vscdb");
    try {
      const db = new sqlite!.DatabaseSync(dbPath);
      db.exec("CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)");
      db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run(
        "agentPlugins.enablement",
        JSON.stringify([["file:///c%3A/git/m/plugins/gl", false]])
      );
      db.close();

      const disabled = new VsCodePluginEnablementReader(dbPath).getDisabledKeys();

      assert.deepStrictEqual([...(disabled ?? [])], [key("file:///c%3A/git/m/plugins/gl")]);
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  });

  test("returns an empty set when the key is absent", async function () {
    const sqlite = loadSqlite();
    if (!sqlite) {
      this.skip();
    }
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nexkit-state-"));
    const dbPath = path.join(dir, "state.vscdb");
    try {
      const db = new sqlite!.DatabaseSync(dbPath);
      db.exec("CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)");
      db.close();

      assert.strictEqual(new VsCodePluginEnablementReader(dbPath).getDisabledKeys()?.size, 0);
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  });
});
