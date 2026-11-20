import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../public/parser.js';
import { serialize } from '../public/serializer.js';
import * as T from '../public/tree.js';

const load = (s) => parse(s).doc;
const SRC = 'mindmap\n  root\n    a\n      a1\n      a2\n    b\n    c\n      c1';
const byText = (doc, text) => {
  let hit;
  (function walk(n) { if (n.text === text) hit = n; n.children.forEach(walk); })(doc.root);
  return hit;
};

test('addChild appends (or inserts at index)', () => {
  const d = load(SRC);
  T.addChild(d.root, byText(d, 'b').uid);
  assert.equal(serialize(d), SRC.replace('    b\n', '    b\n      New node\n'));
  const n = T.addChild(d.root, d.root.uid, undefined, 0);
  assert.equal(d.root.children[0], n);
});

test('addSibling inserts after; on the root it adds a child', () => {
  const d = load(SRC);
  T.addSibling(d.root, byText(d, 'a').uid);
  assert.deepEqual(d.root.children.map((c) => c.text), ['a', 'New node', 'b', 'c']);
  T.addSibling(d.root, d.root.uid);
  assert.equal(d.root.children.at(-1).text, 'New node');
  assert.equal(d.root.children.length, 5);
});

test('remove deletes the whole subtree and reports position', () => {
  const d = load(SRC);
  const r = T.remove(d.root, byText(d, 'a').uid);
  assert.equal(r.index, 0);
  assert.equal(serialize(d), 'mindmap\n  root\n    b\n    c\n      c1');
});

test('the root cannot be removed or moved', () => {
  const d = load(SRC);
  assert.equal(T.remove(d.root, d.root.uid), null);
  assert.equal(T.move(d.root, d.root.uid, byText(d, 'b').uid, 0), false);
});

test('move re-parents with its subtree', () => {
  const d = load(SRC);
  assert.ok(T.move(d.root, byText(d, 'a').uid, byText(d, 'b').uid, 0));
  assert.equal(serialize(d), 'mindmap\n  root\n    b\n      a\n        a1\n        a2\n    c\n      c1');
});

test('move reorders siblings; index counts without the moving node', () => {
  const d = load(SRC);
  T.move(d.root, byText(d, 'a').uid, d.root.uid, 1); // a, b, c -> b, a, c
  assert.deepEqual(d.root.children.map((c) => c.text), ['b', 'a', 'c']);
  T.move(d.root, byText(d, 'c').uid, d.root.uid, 0);
  assert.deepEqual(d.root.children.map((c) => c.text), ['c', 'b', 'a']);
  T.move(d.root, byText(d, 'c').uid, d.root.uid, 99); // clamped
  assert.deepEqual(d.root.children.map((c) => c.text), ['b', 'a', 'c']);
});

test('move into own descendant or self is rejected and changes nothing', () => {
  const d = load(SRC);
  const before = serialize(d);
  assert.equal(T.move(d.root, byText(d, 'a').uid, byText(d, 'a1').uid, 0), false);
  assert.equal(T.move(d.root, byText(d, 'a').uid, byText(d, 'a').uid, 0), false);
  assert.equal(T.move(d.root, byText(d, 'a').uid, 'nope', 0), false);
  assert.equal(serialize(d), before);
});

test('pathOf / nodeAt survive a re-parse and fall back to the nearest ancestor', () => {
  const d = load(SRC);
  const path = T.pathOf(d.root, byText(d, 'c1').uid);
  assert.deepEqual(path, [2, 0]);
  const d2 = load(SRC);
  assert.equal(T.nodeAt(d2.root, path).text, 'c1');
  assert.equal(T.nodeAt(d2.root, [2, 0, 5]).text, 'c1');
  assert.equal(T.nodeAt(d2.root, [9]).uid, d2.root.uid);
});

test('rename keeps structure stable through serialize -> parse', () => {
  for (const text of ['plain', 'looks(like)shape', 'x[y]', '%% not a comment', ':::cls', '::icon(x)', 'say "hi"', 'a ((b))']) {
    const d = load(SRC);
    const n = byText(d, 'b');
    assert.ok(T.rename(d.root, n.uid, text));
    const again = parse(serialize(d)).doc;
    assert.equal(serialize(again), serialize(d), text);
    assert.equal(again.root.children.length, 3, text);
    assert.equal(again.root.children[1].shape, 'default', text);
    assert.equal(again.root.children[1].children.length, 0, text);
  }
});

test('rename ignores empty text; decodeText strips the protective quotes', () => {
  const d = load(SRC);
  const n = byText(d, 'b');
  assert.equal(T.rename(d.root, n.uid, '   '), false);
  assert.equal(n.text, 'b');
  T.rename(d.root, n.uid, 'x(y)');
  assert.equal(T.decodeText(n), 'x(y)');
});

test('rename on a shaped node keeps the shape', () => {
  const d = load('mindmap\n  root((R))\n    a');
  T.rename(d.root, d.root.uid, 'New title');
  assert.equal(serialize(d), 'mindmap\n  root((New title))\n    a');
});
