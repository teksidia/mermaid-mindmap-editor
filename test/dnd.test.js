import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../public/parser.js';
import { serialize } from '../public/serializer.js';
import { layout } from '../public/layout.js';
import { computeDrop } from '../public/dnd.js';
import * as T from '../public/tree.js';

const SRC = 'mindmap\n  root\n    a\n      a1\n    b\n    c';
const setup = () => {
  const doc = parse(SRC).doc;
  const { pos } = layout(doc.root, (s) => s.length * 7);
  const by = (t) => {
    let hit;
    (function w(n) { if (n.text === t) hit = n; n.children.forEach(w); })(doc.root);
    return hit;
  };
  // point at a fraction of a node's box (fx, fy in 0..1, may be outside)
  const at = (t, fx, fy) => {
    const p = pos.get(by(t).uid);
    return [p.x + p.w * fx, p.y + p.h * fy];
  };
  return { doc, pos, by, at };
};

test('middle of a node = last child of it', () => {
  const { doc, pos, by, at } = setup();
  const d = computeDrop(doc.root, pos, by('c').uid, ...at('b', 0.5, 0.5));
  assert.deepEqual(d, { uid: by('c').uid, kind: 'child', targetUid: by('b').uid, parentUid: by('b').uid, index: 0 });
});

test('top / bottom edge = sibling before / after', () => {
  const { doc, pos, by, at } = setup();
  const before = computeDrop(doc.root, pos, by('c').uid, ...at('a', 0.5, 0.1));
  assert.equal(before.kind, 'before');
  assert.equal(before.parentUid, doc.root.uid);
  assert.equal(before.index, 0);
  const after = computeDrop(doc.root, pos, by('c').uid, ...at('a', 0.5, 0.9));
  assert.equal(after.kind, 'after');
  assert.equal(after.index, 1);
});

test('dropping onto the root always makes a child', () => {
  const { doc, pos, by, at } = setup();
  const d = computeDrop(doc.root, pos, by('a1').uid, ...at('root', 0.5, 0.05));
  assert.equal(d.kind, 'child');
  assert.equal(d.parentUid, doc.root.uid);
  assert.equal(d.index, 3);
});

test('own subtree is never a target; root cannot be dragged', () => {
  const { doc, pos, by, at } = setup();
  const [x, y] = at('a1', 0.5, 0.5);
  const d = computeDrop(doc.root, pos, by('a').uid, x, y);
  assert.ok(!d || (d.targetUid !== by('a1').uid && d.targetUid !== by('a').uid));
  assert.equal(computeDrop(doc.root, pos, doc.root.uid, x, y), null);
});

test('no-op drops and far-away drops return null', () => {
  const { doc, pos, by, at } = setup();
  // 'b' released just below itself = still in place
  assert.equal(computeDrop(doc.root, pos, by('b').uid, ...at('b', 0.5, 0.9)), null);
  assert.equal(computeDrop(doc.root, pos, by('b').uid, -500, -500), null);
});

test('computed drops feed tree.move correctly (reorder + re-parent)', () => {
  let s = setup();
  // c before a
  let d = computeDrop(s.doc.root, s.pos, s.by('c').uid, ...s.at('a', 0.5, 0.1));
  assert.ok(T.move(s.doc.root, d.uid, d.parentUid, d.index));
  assert.deepEqual(s.doc.root.children.map((n) => n.text), ['c', 'a', 'b']);

  s = setup(); // a after c (moving forward within the same parent)
  d = computeDrop(s.doc.root, s.pos, s.by('a').uid, ...s.at('c', 0.5, 0.9));
  T.move(s.doc.root, d.uid, d.parentUid, d.index);
  assert.deepEqual(s.doc.root.children.map((n) => n.text), ['b', 'c', 'a']);

  s = setup(); // c onto a -> last child of a, subtree intact
  d = computeDrop(s.doc.root, s.pos, s.by('c').uid, ...s.at('a', 0.5, 0.5));
  T.move(s.doc.root, d.uid, d.parentUid, d.index);
  assert.equal(serialize(s.doc), 'mindmap\n  root\n    a\n      a1\n      c\n    b');

  s = setup(); // a1 up to root level, between b and c
  d = computeDrop(s.doc.root, s.pos, s.by('a1').uid, ...s.at('c', 0.5, 0.1));
  T.move(s.doc.root, d.uid, d.parentUid, d.index);
  assert.equal(serialize(s.doc), 'mindmap\n  root\n    a\n    b\n    a1\n    c');
});
