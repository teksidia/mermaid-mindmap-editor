// Layout -> SVG, plus pan/zoom and hit-testing. Everything is built with
// createElementNS/textContent, so node text is never interpreted as markup.
import { METRICS } from './layout.js';

const NS = 'http://www.w3.org/2000/svg';
export const FONT = '14px system-ui, sans-serif'; // keep in sync with style.css (.node text)

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

export function makeMeasure(font = FONT) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = font;
  const cache = new Map();
  return (s) => {
    let w = cache.get(s);
    if (w === undefined) cache.set(s, (w = ctx.measureText(s).width));
    return w;
  };
}

// Points around an ellipse inscribed in the box; r(i) optionally scales the radius.
function ring(w, h, n, r = () => 1) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([w / 2 + (Math.cos(a) * w * r(i)) / 2, h / 2 + (Math.sin(a) * h * r(i)) / 2]);
  }
  return pts;
}

function shapeEl(shape, w, h, g) {
  const f = (n) => n.toFixed(1);
  switch (shape) {
    case 'circle':
      return el('ellipse', { cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2 }, g);
    case 'square':
      return el('rect', { width: w, height: h, rx: 2 }, g);
    case 'rounded':
      return el('rect', { width: w, height: h, rx: 14 }, g);
    case 'hexagon': {
      const i = 12;
      const pts = [[i, 0], [w - i, 0], [w, h / 2], [w - i, h], [i, h], [0, h / 2]];
      return el('polygon', { points: pts.map((p) => p.join(',')).join(' ') }, g);
    }
    case 'bang': {
      const pts = ring(w, h, 20, (i) => (i % 2 ? 0.8 : 1));
      return el('polygon', { points: pts.map((p) => f(p[0]) + ',' + f(p[1])).join(' ') }, g);
    }
    case 'cloud': {
      const n = 14;
      const pts = ring(w * 0.94, h * 0.94, n).map(([x, y]) => [x + w * 0.03, y + h * 0.03]);
      let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
      for (let i = 1; i <= n; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i % n];
        const r = Math.hypot(x1 - x0, y1 - y0) * 0.62;
        d += `A${f(r)},${f(r)} 0 0 1 ${f(x1)},${f(y1)}`;
      }
      return el('path', { d: d + 'Z' }, g);
    }
    default:
      return el('rect', { width: w, height: h, rx: 6 }, g);
  }
}

function countDescendants(n) {
  return n.children.reduce((s, c) => s + 1 + countDescendants(c), 0);
}

/** Rebuild the whole drawing inside `viewport` (a <g>). */
export function renderTree(viewport, root, lay, selected = null) {
  viewport.replaceChildren();
  const links = el('g', { class: 'links' }, viewport);
  const nodes = el('g', { class: 'nodes' }, viewport);
  const { pos } = lay;

  (function walk(n) {
    const p = pos.get(n.uid);
    for (const c of n.children) {
      if (!pos.has(c.uid)) continue; // hidden by a collapsed ancestor
      const q = pos.get(c.uid);
      const x0 = p.x + p.w, y0 = p.y + p.h / 2, x1 = q.x, y1 = q.y + q.h / 2;
      const mx = (x0 + x1) / 2;
      el('path', { class: 'link d' + Math.min(q.depth, 5), d: `M${x0},${y0}C${mx},${y0} ${mx},${y1} ${x1},${y1}` }, links);
      walk(c);
    }

    const g = el('g', {
      class: `node d${Math.min(p.depth, 5)} shape-${n.shape}` + (n.uid === selected ? ' selected' : ''),
      transform: `translate(${p.x} ${p.y})`,
      'data-uid': n.uid,
    }, nodes);
    // Invisible bridge so hover survives the gap between the node and its "+" button.
    el('rect', { class: 'bridge', x: p.w, y: 0, width: 36, height: p.h }, g);
    shapeEl(n.shape, p.w, p.h, g);
    const add = el('g', { class: 'add', transform: `translate(${p.w + 26} ${p.h / 2})` }, g);
    el('circle', { r: 9 }, add);
    el('path', { d: 'M-4,0H4M0,-4V4' }, add);
    if (n.children.length) {
      // Collapse toggle on the right edge: '-' when expanded, hidden-descendant count when collapsed.
      const isCollapsed = !pos.has(n.children[0].uid);
      const tg = el('g', { class: 'toggle' + (isCollapsed ? ' collapsed' : ''), transform: `translate(${p.w} ${p.h / 2})` }, g);
      el('circle', { r: isCollapsed ? 10 : 7 }, tg);
      if (isCollapsed) el('text', {}, tg).textContent = String(countDescendants(n));
      else el('path', { d: 'M-3.5,0H3.5' }, tg);
    }
    const t = el('text', { x: p.w / 2, y: p.h / 2 }, g);
    const top = -((p.lines.length - 1) * METRICS.lineH) / 2;
    p.lines.forEach((line, i) => {
      const s = el('tspan', { x: p.w / 2, dy: i === 0 ? top : METRICS.lineH }, t);
      s.textContent = line;
    });
  })(root);
}

/** uid of the node under a client coordinate, or null. */
export function hitTest(clientX, clientY) {
  const e = document.elementFromPoint(clientX, clientY);
  const g = e && e.closest && e.closest('[data-uid]');
  return g ? g.getAttribute('data-uid') : null;
}

/** Remove the drag-and-drop indicator, if any. */
export function clearDropIndicator(viewport) {
  viewport.querySelector('.drop-indicator')?.remove();
}

/** Draw where a drop would land: a box around the target (child) or a line above/below it. */
export function showDropIndicator(viewport, lay, drop) {
  clearDropIndicator(viewport);
  if (!drop) return;
  const p = lay.pos.get(drop.targetUid);
  const g = el('g', { class: 'drop-indicator' }, viewport);
  if (drop.kind === 'child') {
    el('rect', { x: p.x - 5, y: p.y - 5, width: p.w + 10, height: p.h + 10, rx: 10 }, g);
    return;
  }
  const y = drop.kind === 'before' ? p.y - METRICS.gapY / 2 : p.y + p.h + METRICS.gapY / 2;
  el('line', { x1: p.x - 6, x2: p.x + p.w + 6, y1: y, y2: y }, g);
}

/** uid of the node whose collapse toggle is under a client coordinate, or null. */
export function hitToggle(clientX, clientY) {
  const e = document.elementFromPoint(clientX, clientY);
  const tg = e && e.closest && e.closest('.toggle');
  return tg ? tg.closest('[data-uid]').getAttribute('data-uid') : null;
}

/** uid of the node whose "+" button is under a client coordinate, or null. */
export function hitAdd(clientX, clientY) {
  const e = document.elementFromPoint(clientX, clientY);
  const add = e && e.closest && e.closest('.add');
  return add ? add.closest('[data-uid]').getAttribute('data-uid') : null;
}

/**
 * Pan (drag), zoom (wheel, pinch) for `viewport` inside `svg`.
 * Returns { fit(bounds), get() }.
 */
export function attachPanZoom(svg, viewport, { shouldPan = () => true } = {}) {
  const t = { x: 0, y: 0, k: 1 };
  const MIN = 0.1, MAX = 4;
  const apply = () => viewport.setAttribute('transform', `translate(${t.x} ${t.y}) scale(${t.k})`);

  const local = (cx, cy) => {
    const r = svg.getBoundingClientRect();
    return [cx - r.left, cy - r.top];
  };
  const zoomAt = (px, py, factor) => {
    const k = Math.min(MAX, Math.max(MIN, t.k * factor));
    const f = k / t.k;
    t.x = px - (px - t.x) * f;
    t.y = py - (py - t.y) * f;
    t.k = k;
  };

  const pointers = new Map();
  let pinch = null; // { dist }

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!shouldPan(e)) return; // e.g. the press started on a draggable node
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]) };
    }
    svg.classList.add('panning');
  });

  svg.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    if (pointers.size === 1) {
      t.x += e.clientX - prev[0];
      t.y += e.clientY - prev[1];
    } else if (pointers.size === 2 && pinch) {
      const before = [...pointers.values()];
      const c0 = [(before[0][0] + before[1][0]) / 2, (before[0][1] + before[1][1]) / 2];
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const c1 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      t.x += c1[0] - c0[0];
      t.y += c1[1] - c0[1];
      if (pinch.dist > 0 && dist > 0) zoomAt(...local(c1[0], c1[1]), dist / pinch.dist);
      pinch.dist = dist;
      apply();
      return;
    }
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    apply();
  });

  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) svg.classList.remove('panning');
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(...local(e.clientX, e.clientY), Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
    apply();
  }, { passive: false });

  return {
    get: () => ({ ...t }),
    fit(bounds, pad = 32) {
      const r = svg.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const bw = bounds.maxX - bounds.minX, bh = bounds.maxY - bounds.minY;
      const k = Math.min(1.2, (r.width - 2 * pad) / bw, (r.height - 2 * pad) / bh);
      t.k = Math.min(MAX, Math.max(MIN, k));
      t.x = (r.width - bw * t.k) / 2 - bounds.minX * t.k;
      t.y = (r.height - bh * t.k) / 2 - bounds.minY * t.k;
      apply();
    },
  };
}
