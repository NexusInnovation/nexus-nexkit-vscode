import * as assert from "assert";
import { layoutStageGraph, GraphLayout, Point } from "../../src/features/devops-pipelines/webview/graphLayout";

/** True when an axis-aligned segment passes through the interior of any node box */
function crossesAnyNode(layout: GraphLayout, from: Point, to: Point, ignore: string[]): boolean {
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxY = Math.max(from.y, to.y);
  return layout.nodes.some(
    (node) =>
      !ignore.includes(node.id) && minX < node.x + node.width && maxX > node.x && minY < node.y + node.height && maxY > node.y
  );
}

function assertNoCrossing(layout: GraphLayout): void {
  for (const edge of layout.edges) {
    for (let i = 0; i < edge.points.length - 1; i++) {
      const a = edge.points[i];
      const b = edge.points[i + 1];
      assert.ok(a.x === b.x || a.y === b.y, `edge ${edge.from}->${edge.to} has a diagonal segment`);
      // A segment may touch its own endpoints' boxes only on their border, which has no interior overlap
      assert.ok(!crossesAnyNode(layout, a, b, []), `edge ${edge.from}->${edge.to} crosses a box`);
    }
  }
}

const node = (id: string, dependsOn: string[] = [], height = 80) => ({ id, height, dependsOn });

suite("Unit: layoutStageGraph", () => {
  test("places stages in columns by dependency depth", () => {
    const layout = layoutStageGraph([node("a"), node("b", ["a"]), node("c", ["b"])]);

    assert.deepStrictEqual(
      layout.nodes.map((n) => n.column),
      [0, 1, 2]
    );
    assert.strictEqual(layout.edges.length, 2);
    assert.ok(layout.width > 0 && layout.height > 0);
  });

  test("edges run from the right side of the dependency to the left side of the dependent", () => {
    const layout = layoutStageGraph([node("a"), node("b", ["a"])]);
    const [a, b] = layout.nodes;
    const [edge] = layout.edges;

    assert.strictEqual(edge.points[0].x, a.x + a.width);
    assert.strictEqual(edge.points[edge.points.length - 1].x, b.x);
  });

  test("a diamond with fan-out and fan-in never crosses a box", () => {
    const layout = layoutStageGraph([
      node("build"),
      node("unit", ["build"], 120),
      node("lint", ["build"], 60),
      node("e2e", ["build"], 200),
      node("deploy", ["unit", "lint", "e2e"]),
    ]);

    assert.strictEqual(layout.edges.length, 6);
    assertNoCrossing(layout);
  });

  test("a dependency spanning several columns is routed around the stages in between", () => {
    const layout = layoutStageGraph([
      node("a"),
      node("b", ["a"], 300),
      node("c", ["b"], 300),
      node("d", ["a", "c"]),
      node("e", ["a", "b", "c", "d"]),
    ]);

    assert.strictEqual(layout.nodes.find((n) => n.id === "e")?.column, 4);
    assertNoCrossing(layout);
  });

  test("independent stages stay in the first column", () => {
    const layout = layoutStageGraph([node("a"), node("b"), node("c")]);

    assert.ok(layout.nodes.every((n) => n.column === 0));
    assert.strictEqual(layout.edges.length, 0);
    const ys = layout.nodes.map((n) => n.y).sort((x, y) => x - y);
    assert.ok(ys[1] >= ys[0] + 80 && ys[2] >= ys[1] + 80, "boxes do not overlap");
  });

  test("ignores unknown or self dependencies and survives cycles", () => {
    const layout = layoutStageGraph([node("a", ["a", "ghost"]), node("b", ["c"]), node("c", ["b"])]);

    assert.strictEqual(layout.nodes.length, 3);
    assertNoCrossing(layout);
  });

  test("an empty graph has no size", () => {
    assert.deepStrictEqual(layoutStageGraph([]), { nodes: [], edges: [], width: 0, height: 0 });
  });
});
