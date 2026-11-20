// Drag and drop of nodes (mouse + touch via Pointer Events).
//
// computeDrop() is pure (layout coordinates in, drop description out);
// attachDnd() wires pointer events, a ghost node and the drop indicator.
import * as T from './tree.js';
import { showDropIndicator, clearDropIndicator } from './render.js';

const DRAG_THRESHOLD = 5; // px before a press becomes a drag

/**
 * Where would node `dragUid` land if released at layout point (x, y)?
 * Returns { uid, kind: 'child'|'before'|'after', targetUid, parentUid, index } or null.
 *  - over the middle of a node  -> its last child
 *  - over the top/bottom quarter -> sibling before/after it (root: always child)
 *  - `index` counts children of `parentUid` after the dragged node is taken out (see tree.move)
 *  - null when nothing is near, or the drop would not change anything
 * The dragged node and its descendants are never targets, so cycles cannot occur.
 */
export function computeDrop(root, pos, dragUid, x, y, reach = 40) {
  const dragged = T.find(root, dragUid);
  if (!dragged || !dragged.parent) return null;

  const banned = new Set();
  (function collect(n) { banned.add(n.uid); n.children.forEach(collect); })(dragged.node);

  let best = null;
  let bestD = Infinity;
  for (const [uid, p] of pos) {
    if (banned.has(uid)) continue;
    const dx = Math.max(p.x - x, 0, x - (p.x + p.w));
    const dy = Math.max(p.y - y, 0, y - (p.y + p.h));
    const d = Math.hypot(dx, dy);
    if (d < bestD) { bestD = d; best = uid; }
  }
  if (best === null || bestD > reach) return null;

  const p = pos.get(best);
  const target = T.find(root, best);
  const ry = (y - p.y) / p.h;
  let kind = ry < 0.25 ? 'before' : ry > 0.75 ? 'after' : 'child';
  if (!target.parent) kind = 'child';

  let parentUid, index;
  if (kind === 'child') {
    parentUid = best;
    index = target.node.children.filter((c) => c.uid !== dragUid).length;
  } else {
    parentUid = target.parent.uid;
    const sibs = target.parent.children.filter((c) => c.uid !== dragUid);
    const at = sibs.findIndex((c) => c.uid === best);
    index = kind === 'before' ? at : at + 1;
  }

  if (dragged.parent.uid === parentUid && dragged.index === index) return null; // no-op
  return { uid: dragUid, kind, targetUid: best, parentUid, index };
}

/**
 * opts: { svg, viewport, view, getDoc, getLayout, hitTest, hitControl, onDrop(drop) }
 * Register after other pointerdown handlers that may redraw (e.g. ending an inline edit).
 */
export function attachDnd({ svg, viewport, view, getDoc, getLayout, hitTest, hitControl, onDrop }) {
  let cand = null; // pressed on a node, not yet dragging
  let drag = null; // { id, uid, ghost, off, drop }

  const toLayout = (cx, cy) => {
    const r = svg.getBoundingClientRect();
    const t = view.get();
    return [(cx - r.left - t.x) / t.k, (cy - r.top - t.y) / t.k];
  };
  const nodeEl = (uid) => viewport.querySelector(`[data-uid="${uid}"]`);

  function start(e) {
    const lay = getLayout();
    const p = lay.pos.get(cand.uid);
    const src = nodeEl(cand.uid);
    if (!p || !src) { cand = null; return; }
    svg.setPointerCapture(e.pointerId);

    const [px, py] = toLayout(cand.x, cand.y);
    const ghost = src.cloneNode(true);
    ghost.removeAttribute('data-uid');
    ghost.classList.add('ghost');
    ghost.querySelectorAll('.add, .toggle').forEach((c) => c.remove());
    viewport.appendChild(ghost);

    // Dim the node and its subtree while it is being carried.
    const f = T.find(getDoc().root, cand.uid);
    (function dim(n) { nodeEl(n.uid)?.classList.add('dragging'); n.children.forEach(dim); })(f.node);

    svg.classList.add('dragging-node');
    drag = { id: e.pointerId, uid: cand.uid, ghost, off: [px - p.x, py - p.y], drop: null };
    cand = null;
  }

  function move(e) {
    const [lx, ly] = toLayout(e.clientX, e.clientY);
    drag.ghost.setAttribute('transform', `translate(${lx - drag.off[0]} ${ly - drag.off[1]})`);
    drag.drop = computeDrop(getDoc().root, getLayout().pos, drag.uid, lx, ly);
    showDropIndicator(viewport, getLayout(), drag.drop);
  }

  function end(commit) {
    if (!drag) return;
    const { ghost, drop } = drag;
    drag = null;
    ghost.remove();
    clearDropIndicator(viewport);
    viewport.querySelectorAll('.dragging').forEach((g) => g.classList.remove('dragging'));
    svg.classList.remove('dragging-node');
    if (commit && drop) onDrop(drop);
  }

  svg.addEventListener('pointerdown', (e) => {
    if (drag || cand) return; // ignore a second finger
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (hitControl(e.clientX, e.clientY)) return;
    const uid = hitTest(e.clientX, e.clientY);
    if (!uid || uid === getDoc().root.uid) return;
    cand = { uid, id: e.pointerId, x: e.clientX, y: e.clientY };
  });

  svg.addEventListener('pointermove', (e) => {
    if (cand && e.pointerId === cand.id &&
        Math.hypot(e.clientX - cand.x, e.clientY - cand.y) > DRAG_THRESHOLD) start(e);
    if (drag && e.pointerId === drag.id) move(e);
  });

  svg.addEventListener('pointerup', (e) => {
    if (cand && e.pointerId === cand.id) cand = null;
    if (drag && e.pointerId === drag.id) end(true);
  });
  svg.addEventListener('pointercancel', (e) => {
    if (cand && e.pointerId === cand.id) cand = null;
    if (drag && e.pointerId === drag.id) end(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drag) { e.preventDefault(); end(false); }
  });
}
