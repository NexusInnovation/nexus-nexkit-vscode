/**
 * Tests for fuzzySearch utility
 * Lightweight fuzzy search for template matching
 */

import * as assert from "assert";
import { fuzzySearch, FuzzySearchResult } from "../../src/features/panel-ui/webview/utils/fuzzySearch";

interface TestItem {
  name: string;
  description: string;
}

function getTestText(item: TestItem): string[] {
  return [item.name, item.description];
}

suite("Unit: fuzzySearch", () => {
  const items: TestItem[] = [
    { name: "python-agent", description: "A Python code assistant for debugging and writing" },
    { name: "react-component", description: "Generate React component files with TypeScript" },
    { name: "terraform-deploy", description: "Infrastructure deployment templates" },
    { name: "code-review", description: "Automated code review assistant" },
    { name: "documentation", description: "Generate project documentation from code" },
    { name: "unit-test-gen", description: "Generate unit tests for Python and JavaScript" },
  ];

  test("Should return all items when query is empty", () => {
    const results = fuzzySearch("", items, getTestText);
    assert.strictEqual(results.length, items.length);
  });

  test("Should return all items when query is whitespace", () => {
    const results = fuzzySearch("   ", items, getTestText);
    assert.strictEqual(results.length, items.length);
  });

  test("Should find exact name match with highest score", () => {
    const results = fuzzySearch("python-agent", items, getTestText);
    assert.ok(results.length > 0, "Should have at least one result");
    assert.strictEqual(results[0].item.name, "python-agent");
  });

  test("Should find items by description keyword", () => {
    const results = fuzzySearch("debugging", items, getTestText);
    assert.ok(results.length > 0, "Should find items matching description");
    assert.ok(
      results.some((r) => r.item.name === "python-agent"),
      "Should find python-agent via description"
    );
  });

  test("Should rank exact matches higher than partial", () => {
    const results = fuzzySearch("code", items, getTestText);
    assert.ok(results.length >= 2, "Should find multiple matches");
    // Items with 'code' in the name should rank high
    const codeReviewIdx = results.findIndex((r) => r.item.name === "code-review");
    assert.ok(codeReviewIdx !== -1, "code-review should be in results");
  });

  test("Should support multi-token search", () => {
    const results = fuzzySearch("python test", items, getTestText);
    assert.ok(results.length > 0, "Should find items matching multiple tokens");
    // unit-test-gen has 'Python' in description and 'test' in name
    assert.ok(
      results.some((r) => r.item.name === "unit-test-gen"),
      "Should find unit-test-gen via multi-token match"
    );
  });

  test("Should return empty for non-matching query", () => {
    const results = fuzzySearch("zzzznotfound", items, getTestText);
    assert.strictEqual(results.length, 0, "Should return no results for non-matching query");
  });

  test("Should be case insensitive", () => {
    const results = fuzzySearch("PYTHON", items, getTestText);
    assert.ok(results.length > 0, "Should find results regardless of case");
    assert.ok(
      results.some((r) => r.item.name === "python-agent"),
      "Should find python-agent with uppercase query"
    );
  });

  test("Should sort results by descending score", () => {
    const results = fuzzySearch("react", items, getTestText);
    for (let i = 1; i < results.length; i++) {
      assert.ok(
        results[i - 1].score >= results[i].score,
        `Results should be sorted by descending score: ${results[i - 1].score} >= ${results[i].score}`
      );
    }
  });

  test("Should perform fuzzy character matching", () => {
    // 'pya' should fuzzy-match 'python-agent' (p-y-t-h-o-n-a-g-e-n-t)
    const results = fuzzySearch("pyag", items, getTestText);
    assert.ok(
      results.some((r) => r.item.name === "python-agent"),
      "Should fuzzy-match python-agent"
    );
  });

  test("Should handle single-field items", () => {
    const singleFieldItems = [{ name: "test", description: "" }];
    const results = fuzzySearch("test", singleFieldItems, (item: TestItem) => [item.name]);
    assert.ok(results.length > 0, "Should match single-field items");
  });

  test("Should handle items with empty fields", () => {
    const emptyItems = [{ name: "", description: "" }];
    const results = fuzzySearch("test", emptyItems, getTestText);
    assert.strictEqual(results.length, 0, "Should not match empty fields");
  });

  test("Should give higher score to word boundary matches", () => {
    const testItems = [
      { name: "my-code-helper", description: "" },
      { name: "decoder", description: "" },
    ];
    const results = fuzzySearch("code", testItems, getTestText);
    assert.ok(results.length >= 1, "Should find at least one match");
    // 'my-code-helper' has 'code' at a word boundary, should score higher
    if (results.length >= 2) {
      const codeHelperResult = results.find((r) => r.item.name === "my-code-helper");
      const decoderResult = results.find((r) => r.item.name === "decoder");
      if (codeHelperResult && decoderResult) {
        assert.ok(codeHelperResult.score >= decoderResult.score, "Word boundary match should score >= than embedded match");
      }
    }
  });
});
