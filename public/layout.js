// Tree -> positions. Horizontal tidy tree: root on the left, children to the right.
// Pure (no DOM): text measurement is injected, so it can be unit-tested.

export const METRICS = { padX: 14, padY: 8, lineH: 18, minH: 34, gapX: 56, gapY: 12 };

// Visible label lines for a node: unwraps "`markdown`" / "quoted" strings, honours <br>.
export function labelLines(node) {
  let t = String(node.text).trim();
  const md = /^"`([\s\S]*)`"$/.exec(t);
  if (md) t = md[1];
  else {
    const q = /^"([\s\S]*)"$/.exec(t);
    if (q) t = q[1];
  }
  const lines = t.split(/\n|<br\s*\/?>/i).map((s) => s.trim());
  return lines.length ? lines : [''];
}

// Extra room so text fits inside non-rectangular shapes.
function shapeBox(shape, w, h) {
  switch (shape) {
    case 'circle': return { w: w * 1.25 + 8, h: h * 1.35 };
    case 'bang':
    case 'cloud': return { w: w * 1.3 + 12, h: h * 1.45 };
    case 'hexagon': return { w: w + 24, h };
    default: return { w, h };
  }
}

/**
 * Returns { pos: Map(uid -> {x, y, w, h, depth, lines}), bounds: {minX,minY,maxX,maxY} }.
 * x/y is the top-left corner. `collapsed` (optional Set of uids) hides those nodes' descendants.
 */
export function layout(root, measure, m = METRICS, collapsed = null) {
  // Children of collapsed nodes are neither measured nor placed.
  const kids = (n) => (collapsed && collapsed.has(n.uid) ? [] : n.children);
  const pos = new Map();
  const colW = [];

  (function size(n, depth) {
    const lines = labelLines(n);
    let tw = 0;
    for (const l of lines) tw = Math.max(tw, measure(l));
    const base = { w: tw + 2 * m.padX, h: Math.max(m.minH, lines.length * m.lineH + 2 * m.padY) };
    const { w, h } = shapeBox(n.shape, base.w, base.h);
    pos.set(n.uid, { x: 0, y: 0, w, h, depth, lines });
    colW[depth] = Math.max(colW[depth] || 0, w);
    kids(n).forEach((c) => size(c, depth + 1));
  })(root, 0);

  const colX = [0];
  for (let d = 0; d < colW.length; d++) colX[d + 1] = colX[d] + colW[d] + m.gapX;

  const lastBottom = []; // per depth: lowest edge placed so far
  let cursor = 0; // next free y for a leaf

  const bump = (n) => {
    const p = pos.get(n.uid);
    lastBottom[p.depth] = Math.max(lastBottom[p.depth] ?? -Infinity, p.y + p.h);
    kids(n).forEach(bump);
  };
  const shift = (n, dy) => {
    pos.get(n.uid).y += dy;
    kids(n).forEach((c) => shift(c, dy));
  };
  const maxBottom = (n) =>
    Math.max(pos.get(n.uid).y + pos.get(n.uid).h, ...kids(n).map(maxBottom));

  (function place(n) {
    const p = pos.get(n.uid);
    p.x = colX[p.depth];
    if (!kids(n).length) {
      p.y = cursor;
    } else {
      kids(n).forEach(place);
      const a = pos.get(kids(n)[0].uid);
      const b = pos.get(kids(n)[kids(n).length - 1].uid);
      p.y = (a.y + a.h / 2 + b.y + b.h / 2) / 2 - p.h / 2;
    }
    // A tall parent must not collide with a node already placed in its column.
    const floor = (lastBottom[p.depth] ?? -Infinity) + m.gapY;
    if (p.y < floor && lastBottom[p.depth] !== undefined) shift(n, floor - p.y);
    cursor = Math.max(cursor, maxBottom(n) + m.gapY);
    bump(n);
  })(root);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pos.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.w);
    maxY = Math.max(maxY, p.y + p.h);
  }
  return { pos, bounds: { minX, minY, maxX, maxY } };
}
