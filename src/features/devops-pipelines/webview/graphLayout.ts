/**
 * Pure layered layout for the stages dependency graph.
 *
 * Stages are placed in columns by dependency depth. A dependency spanning several columns is routed
 * through invisible "dummy" slots in every intermediate column, so edges only ever travel horizontally
 * through free slots or vertically inside the gutters between columns — never across another box.
 */

export interface GraphNodeInput {
  id: string;
  height: number;
  dependsOn: string[];
}

export interface GraphLayoutOptions {
  nodeWidth: number;
  columnGap: number;
  rowGap: number;
  /** Vertical space reserved in a column for each edge passing through it */
  laneHeight: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface PlacedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  column: number;
}

export interface PlacedEdge {
  from: string;
  to: string;
  /** Orthogonal polyline from the right side of `from` to the left side of `to` */
  points: Point[];
}

export interface GraphLayout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
}

interface Slot {
  key: string;
  column: number;
  height: number;
  node?: GraphNodeInput;
  y: number;
}

const DEFAULT_OPTIONS: GraphLayoutOptions = { nodeWidth: 220, columnGap: 64, rowGap: 16, laneHeight: 14 };
const SWEEPS = 4;

function computeColumns(nodes: GraphNodeInput[], deps: Map<string, string[]>): Map<string, number> {
  const columns = new Map<string, number>();
  const visiting = new Set<string>();

  const visit = (id: string): number => {
    const known = columns.get(id);
    if (known !== undefined) {
      return known;
    }
    if (visiting.has(id)) {
      return 0; // dependency cycle: break it
    }
    visiting.add(id);
    const column = Math.max(-1, ...(deps.get(id) ?? []).map(visit)) + 1;
    visiting.delete(id);
    columns.set(id, column);
    return column;
  };

  nodes.forEach((n) => visit(n.id));
  return columns;
}

export function layoutStageGraph(nodes: GraphNodeInput[], options: Partial<GraphLayoutOptions> = {}): GraphLayout {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const ids = new Set(nodes.map((n) => n.id));
  const deps = new Map(nodes.map((n) => [n.id, [...new Set(n.dependsOn)].filter((d) => ids.has(d) && d !== n.id)]));
  const columns = computeColumns(nodes, deps);
  const columnCount = Math.max(0, ...[...columns.values()].map((c) => c + 1));

  const layers: Slot[][] = Array.from({ length: columnCount }, () => []);
  const slotByKey = new Map<string, Slot>();
  const addSlot = (slot: Slot): void => {
    layers[slot.column].push(slot);
    slotByKey.set(slot.key, slot);
  };

  nodes.forEach((node) => addSlot({ key: node.id, column: columns.get(node.id) ?? 0, height: node.height, node: node, y: 0 }));

  // Each edge becomes a chain of slots, one per column crossed
  const chains: { from: string; to: string; keys: string[] }[] = [];
  for (const node of nodes) {
    for (const dep of deps.get(node.id) ?? []) {
      const fromColumn = columns.get(dep) ?? 0;
      const toColumn = columns.get(node.id) ?? 0;
      if (fromColumn >= toColumn) {
        continue; // only possible with cycles
      }
      const keys = [dep];
      for (let c = fromColumn + 1; c < toColumn; c++) {
        const key = `${dep}->${node.id}@${c}`;
        addSlot({ key, column: c, height: opts.laneHeight, y: 0 });
        keys.push(key);
      }
      keys.push(node.id);
      chains.push({ from: dep, to: node.id, keys });
    }
  }

  orderLayers(layers, chains);
  placeVertically(layers, opts.rowGap);

  const placed = new Map<string, { x: number; y: number }>();
  const columnX = (c: number): number => c * (opts.nodeWidth + opts.columnGap);
  for (const layer of layers) {
    for (const slot of layer) {
      placed.set(slot.key, { x: columnX(slot.column), y: slot.y });
    }
  }

  const laneOf = assignLanes(chains, slotByKey);
  const edges = chains.map((chain, index) => buildEdge(chain, index, slotByKey, placed, laneOf, opts));

  const placedNodes: PlacedNode[] = nodes.map((node) => {
    const position = placed.get(node.id) ?? { x: 0, y: 0 };
    return {
      id: node.id,
      x: position.x,
      y: position.y,
      width: opts.nodeWidth,
      height: node.height,
      column: columns.get(node.id) ?? 0,
    };
  });

  const width = columnCount === 0 ? 0 : columnX(columnCount - 1) + opts.nodeWidth;
  const height = Math.max(0, ...layers.map((layer) => layerHeight(layer, opts.rowGap)));
  return { nodes: placedNodes, edges, width, height };
}

function layerHeight(layer: Slot[], rowGap: number): number {
  return layer.reduce((sum, slot) => sum + slot.height, 0) + Math.max(0, layer.length - 1) * rowGap;
}

/** Reduces edge crossings by sorting each layer on the average position of its neighbours */
function orderLayers(layers: Slot[][], chains: { keys: string[] }[]): void {
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  for (const chain of chains) {
    for (let i = 0; i < chain.keys.length - 1; i++) {
      successors.set(chain.keys[i], [...(successors.get(chain.keys[i]) ?? []), chain.keys[i + 1]]);
      predecessors.set(chain.keys[i + 1], [...(predecessors.get(chain.keys[i + 1]) ?? []), chain.keys[i]]);
    }
  }

  const positions = new Map<string, number>();
  const refresh = (layer: Slot[]): void => layer.forEach((slot, index) => positions.set(slot.key, index));
  layers.forEach(refresh);

  const sortLayer = (layer: Slot[], neighbours: Map<string, string[]>): void => {
    const barycenter = (slot: Slot): number => {
      const linked = neighbours.get(slot.key) ?? [];
      if (linked.length === 0) {
        return positions.get(slot.key) ?? 0;
      }
      return linked.reduce((sum, key) => sum + (positions.get(key) ?? 0), 0) / linked.length;
    };
    const keyed = layer.map((slot, index) => ({ slot, index, weight: barycenter(slot) }));
    keyed.sort((a, b) => a.weight - b.weight || a.index - b.index);
    keyed.forEach((entry, index) => (layer[index] = entry.slot));
    refresh(layer);
  };

  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    for (let i = 1; i < layers.length; i++) {
      sortLayer(layers[i], predecessors);
    }
    for (let i = layers.length - 2; i >= 0; i--) {
      sortLayer(layers[i], successors);
    }
  }
}

/** Stacks slots in each layer and centers every layer against the tallest one */
function placeVertically(layers: Slot[][], rowGap: number): void {
  const tallest = Math.max(0, ...layers.map((layer) => layerHeight(layer, rowGap)));
  for (const layer of layers) {
    let y = (tallest - layerHeight(layer, rowGap)) / 2;
    for (const slot of layer) {
      slot.y = y;
      y += slot.height + rowGap;
    }
  }
}

/** Gives every edge its own vertical lane inside each gutter so edges never share a vertical segment */
function assignLanes(chains: { keys: string[] }[], slots: Map<string, Slot>): Map<string, number> {
  const perGutter = new Map<number, { chainIndex: number; sourceY: number }[]>();
  chains.forEach((chain, chainIndex) => {
    for (let i = 0; i < chain.keys.length - 1; i++) {
      const source = slots.get(chain.keys[i]);
      if (!source) {
        continue;
      }
      const list = perGutter.get(source.column) ?? [];
      list.push({ chainIndex, sourceY: source.y });
      perGutter.set(source.column, list);
    }
  });

  const lanes = new Map<string, number>();
  for (const [gutter, entries] of perGutter) {
    entries.sort((a, b) => a.sourceY - b.sourceY || a.chainIndex - b.chainIndex);
    entries.forEach((entry, index) => lanes.set(`${gutter}:${entry.chainIndex}`, (index + 1) / (entries.length + 1)));
  }
  return lanes;
}

function buildEdge(
  chain: { from: string; to: string; keys: string[] },
  chainIndex: number,
  slots: Map<string, Slot>,
  placed: Map<string, { x: number; y: number }>,
  lanes: Map<string, number>,
  opts: GraphLayoutOptions
): PlacedEdge {
  const centerY = (key: string): number => (placed.get(key)?.y ?? 0) + (slots.get(key)?.height ?? 0) / 2;
  const points: Point[] = [];
  const push = (point: Point): void => {
    const last = points[points.length - 1];
    if (!last || last.x !== point.x || last.y !== point.y) {
      points.push(point);
    }
  };

  for (let i = 0; i < chain.keys.length - 1; i++) {
    const from = placed.get(chain.keys[i]);
    const to = placed.get(chain.keys[i + 1]);
    const fromSlot = slots.get(chain.keys[i]);
    if (!from || !to || !fromSlot) {
      continue;
    }
    const gutterStart = from.x + opts.nodeWidth;
    const laneX = gutterStart + (lanes.get(`${fromSlot.column}:${chainIndex}`) ?? 0.5) * opts.columnGap;

    push({ x: i === 0 ? gutterStart : from.x, y: centerY(chain.keys[i]) });
    push({ x: gutterStart, y: centerY(chain.keys[i]) });
    push({ x: laneX, y: centerY(chain.keys[i]) });
    push({ x: laneX, y: centerY(chain.keys[i + 1]) });
    push({ x: to.x, y: centerY(chain.keys[i + 1]) });
  }

  return { from: chain.from, to: chain.to, points: simplify(points) };
}

/** Drops intermediate points that lie on a straight line */
function simplify(points: Point[]): Point[] {
  return points.filter((p, i) => {
    const prev = points[i - 1];
    const next = points[i + 1];
    if (!prev || !next) {
      return true;
    }
    return !((prev.x === p.x && p.x === next.x) || (prev.y === p.y && p.y === next.y));
  });
}
