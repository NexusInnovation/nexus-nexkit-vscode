/**
 * Read-only Squad display tests (SQD-024, FR-020/FR-022/FR-024/FR-025).
 *
 * The panel webview has no Preact rendering harness in the extension-host Mocha
 * runner (no jsdom / happy-dom / preact-render-to-string; see the SQD-024
 * report). The hook-free presentational building blocks that every read-only
 * Squad view relies on — {@link SquadMarkdownView} (content) and
 * {@link SquadErrorNotice} (errors) — are pure functions of their props, so we
 * invoke them directly and assert on the returned Preact VNode tree. This runs
 * with no DOM and still verifies the behaviours that matter for read-only
 * display: empty vs. data states, always-visible actionable errors, and — most
 * importantly — that workspace markdown/log content is rendered as escaped
 * text and never injected as HTML.
 *
 * The default Squad AppState slice is also asserted here so the read-only tab
 * starts empty and "not ready" rather than collapsing into a false success.
 */

import * as assert from "assert";
import { SquadMarkdownView } from "../../src/features/panel-ui/webview/components/molecules/SquadMarkdownView";
import { SquadErrorNotice } from "../../src/features/panel-ui/webview/components/molecules/SquadErrorNotice";
import {
  formatUpstreamLastSyncedAt,
  SquadUpstreamList,
} from "../../src/features/panel-ui/webview/components/organisms/SquadUpstreamSection";
import { initialSquadState, SquadLogKind } from "../../src/features/panel-ui/webview/types/squadState";
import { initialAppState } from "../../src/features/panel-ui/webview/types/appState";
import { SquadError, SquadUpstreamKind } from "../../src/features/squad/models";

type VNodeLike = { type: unknown; props: any } | string | number | boolean | null | undefined;

/** Normalise a vnode's children into a flat, render-order array. */
function childrenOf(node: any): any[] {
  const children = node && node.props ? node.props.children : undefined;
  if (children === undefined) {
    return [];
  }
  return Array.isArray(children) ? children : [children];
}

/** Depth-first walk over every vnode in the tree (skips text/primitive nodes). */
function walkVNodes(node: VNodeLike, visit: (vnode: any) => void): void {
  if (node === null || node === undefined || typeof node !== "object") {
    return;
  }
  visit(node);
  childrenOf(node).forEach((child) => walkVNodes(child, visit));
}

/** Find the first vnode whose `class` prop exactly matches `cls`. */
function findByClass(node: VNodeLike, cls: string): any | undefined {
  let match: any | undefined;
  walkVNodes(node, (vnode) => {
    if (match === undefined && vnode.props && vnode.props.class === cls) {
      match = vnode;
    }
  });
  return match;
}

/** Collect every string/number text leaf in render order. */
function textOf(node: VNodeLike): string {
  const parts: string[] = [];
  const collect = (n: VNodeLike): void => {
    if (n === null || n === undefined || typeof n === "boolean") {
      return;
    }
    if (typeof n === "string" || typeof n === "number") {
      parts.push(String(n));
      return;
    }
    childrenOf(n).forEach(collect);
  };
  collect(node);
  return parts.join("");
}

/** True when any vnode in the tree sets `dangerouslySetInnerHTML`. */
function hasRawHtmlSink(node: VNodeLike): boolean {
  let found = false;
  walkVNodes(node, (vnode) => {
    if (vnode.props && vnode.props.dangerouslySetInnerHTML !== undefined) {
      found = true;
    }
  });
  return found;
}

suite("Unit: Squad read-only display (SQD-024)", () => {
  suite("SquadMarkdownView — content states", () => {
    test("Should render non-empty content inside a read-only <pre>", () => {
      const vnode: any = SquadMarkdownView({ content: "# Decisions\n- one\n- two", ariaLabel: "Squad decisions" });
      assert.strictEqual(vnode.type, "pre");
      assert.strictEqual(vnode.props.class, "squad-markdown");
      assert.strictEqual(vnode.props.role, "document");
      assert.strictEqual(vnode.props["aria-label"], "Squad decisions");
      assert.strictEqual(vnode.props.children, "# Decisions\n- one\n- two");
    });

    test("Should show the default empty message for empty content", () => {
      const vnode: any = SquadMarkdownView({ content: "" });
      assert.strictEqual(vnode.type, "p");
      assert.strictEqual(vnode.props.class, "empty-message");
      assert.strictEqual(vnode.props.children, "This document is empty.");
    });

    test("Should treat whitespace-only content as empty", () => {
      const vnode: any = SquadMarkdownView({ content: "   \n\t  ", emptyMessage: "This charter is empty." });
      assert.strictEqual(vnode.type, "p");
      assert.strictEqual(vnode.props.class, "empty-message");
      assert.strictEqual(vnode.props.children, "This charter is empty.");
    });
  });

  suite("SquadMarkdownView — HTML injection safety (security)", () => {
    test("Should keep script markup as literal text, never as an HTML sink", () => {
      const malicious = '<script>alert(document.cookie)</script>';
      const vnode: any = SquadMarkdownView({ content: malicious });

      // Rendered as a text child of <pre> => the browser escapes it at DOM time.
      assert.strictEqual(vnode.type, "pre");
      assert.strictEqual(vnode.props.children, malicious, "content must be preserved verbatim as text");
      assert.strictEqual(hasRawHtmlSink(vnode), false, "must not use dangerouslySetInnerHTML");
    });

    test("Should not interpret event-handler attributes embedded in content", () => {
      const malicious = '<img src=x onerror="alert(1)"> and <a href="javascript:alert(2)">x</a>';
      const vnode: any = SquadMarkdownView({ content: malicious });

      assert.strictEqual(vnode.props.children, malicious);
      assert.strictEqual(hasRawHtmlSink(vnode), false);
      // The whole payload lives in a single text leaf, so no HTML element/attr is produced from it.
      assert.strictEqual(textOf(vnode), malicious);
    });
  });

  suite("SquadErrorNotice — actionable, always visible", () => {
    const baseError: SquadError = {
      code: "file-read-failed",
      message: "Could not read .squad/team.md.",
    };

    test("Should always surface the error message with an alert role", () => {
      const vnode: any = SquadErrorNotice({ error: baseError });
      assert.strictEqual(vnode.props.role, "alert");
      const messageNode = findByClass(vnode, "squad-error-message");
      assert.ok(messageNode, "message element should be present");
      assert.strictEqual(messageNode.props.children, "Could not read .squad/team.md.");
    });

    test("Should render remediation and detail when provided", () => {
      const vnode: any = SquadErrorNotice({
        error: { ...baseError, remediation: "Check the file exists and is readable.", detail: "EACCES" },
      });
      const remediation = findByClass(vnode, "squad-error-remediation");
      const detail = findByClass(vnode, "squad-error-detail");
      assert.ok(remediation, "remediation should be shown");
      assert.strictEqual(remediation.props.children, "Check the file exists and is readable.");
      assert.ok(detail, "detail should be shown");
      assert.strictEqual(detail.props.children, "EACCES");
    });

    test("Should omit remediation and detail when they are absent", () => {
      const vnode: any = SquadErrorNotice({ error: baseError });
      assert.strictEqual(findByClass(vnode, "squad-error-remediation"), undefined);
      assert.strictEqual(findByClass(vnode, "squad-error-detail"), undefined);
      // The message still renders — a failure never collapses into an empty success.
      assert.ok(findByClass(vnode, "squad-error-message"));
    });

    test("Should render error message content as escaped text, not HTML", () => {
      const vnode: any = SquadErrorNotice({
        error: { code: "parse-failed", message: "<b>bad</b>", remediation: "<i>fix</i>" },
      });
      assert.strictEqual(hasRawHtmlSink(vnode), false);
      assert.strictEqual(findByClass(vnode, "squad-error-message").props.children, "<b>bad</b>");
      assert.strictEqual(findByClass(vnode, "squad-error-remediation").props.children, "<i>fix</i>");
    });
  });

  suite("Default Squad state — read-only tab starts empty and not-ready", () => {
    test("Should expose an empty, not-ready, error-free initial slice", () => {
      assert.strictEqual(initialSquadState.isReady, false);
      assert.strictEqual(initialSquadState.isLoading, false);
      assert.strictEqual(initialSquadState.error, null);
      assert.strictEqual(initialSquadState.detection, null);
      assert.strictEqual(initialSquadState.decisions, null);
      assert.strictEqual(initialSquadState.routing, null);
      assert.strictEqual(initialSquadState.doctor, null);
      assert.deepStrictEqual(initialSquadState.roster, []);
      assert.deepStrictEqual(initialSquadState.charters, []);
      assert.deepStrictEqual(initialSquadState.logs, []);
      assert.deepStrictEqual(initialSquadState.upstreams, []);
      assert.deepStrictEqual(initialSquadState.plugins, []);
    });

    test("Should wire the default Squad slice into the global AppState", () => {
      assert.strictEqual(initialAppState.squad, initialSquadState);
    });

    test("Should expose the three read-only log kinds", () => {
      assert.strictEqual(SquadLogKind.AgentHistory, "agent-history");
      assert.strictEqual(SquadLogKind.Log, "log");
      assert.strictEqual(SquadLogKind.Orchestration, "orchestration");
    });
  });

  suite("SquadUpstreamList — FR-030 read-only upstream display", () => {
    test("Should render source id, type, reference and sync timestamp", () => {
      const syncedAt = Date.parse("2026-06-01T00:00:00Z");
      const vnode: any = SquadUpstreamList({
        upstreams: [
          {
            id: "org",
            kind: SquadUpstreamKind.Git,
            reference: "https://example.com/org.git",
            lastSyncedAt: syncedAt,
          },
        ],
      });

      assert.strictEqual(vnode.type, "table");
      assert.strictEqual(vnode.props.class, "squad-upstream-table");
      const text = textOf(vnode);
      assert.ok(text.includes("Source"));
      assert.ok(text.includes("Type"));
      assert.ok(text.includes("Reference"));
      assert.ok(text.includes("Last sync"));
      assert.ok(text.includes("org"));
      assert.ok(text.includes("Git"));
      assert.ok(text.includes("https://example.com/org.git"));
      assert.ok(text.includes(formatUpstreamLastSyncedAt(syncedAt)));
      assert.strictEqual(hasRawHtmlSink(vnode), false);
    });

    test("Should show an explicit empty state when no upstreams are configured", () => {
      const vnode: any = SquadUpstreamList({ upstreams: [] });
      assert.strictEqual(vnode.type, "p");
      assert.strictEqual(vnode.props.class, "empty-message");
      assert.ok(textOf(vnode).includes(".squad/upstream.json"));
    });

    test("Should label missing sync dates explicitly", () => {
      assert.strictEqual(formatUpstreamLastSyncedAt(undefined), "Never synced");
    });
  });
});
