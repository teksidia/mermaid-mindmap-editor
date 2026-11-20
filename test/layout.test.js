import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../public/parser.js';
import { layout, labelLines, METRICS } from '../public/layout.js';

const measure = (s) => s.length * 7;
const lay = (text) => {
  const { doc } = parse(text);
  return { doc, ...layout(doc.root, measure) };
};
const flat = (n, out = []) => (out.push(n), n.children.forEach((c) => flat(c, out)), out);

const overlaps = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('children sit to the right of their parent, in order', () => {
  const { doc, pos } = lay('mindmap\n  root\n    a\n    b\n    c');
  const p = pos.get(doc.root.uid);
  const ys = doc.root.children.map((c) => pos.get(c.uid).y);
  for (const c of doc.root.children) assert.ok(pos.get(c.uid).x >= p.x + p.w + METRICS.gapX - 1e-9);
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b));
});

test('parent is vertically centred on its children', () => {
  const { doc, pos } = lay('mindmap\n  root\n    a\n    b\n    c');
  const mid = (n) => pos.get(n.uid).y + pos.get(n.uid).h / 2;
  const [a, , c] = doc.root.children;
  assert.ok(Math.abs(mid(doc.root) - (mid(a) + mid(c)) / 2) < 1e-9);
});

test('same-depth nodes align in one column', () => {
  const { doc, pos } = lay('mindmap\n  root\n    short\n      x\n    a much longer label\n      y');
  const [s, l] = doc.root.children;
  assert.equal(pos.get(s.uid).x, pos.get(l.uid).x);
});

test('no two nodes overlap (mixed heights and depths)', () => {
  const text = [
    'mindmap', '  root((R))',
    '    a', '      a1', '      a2', '        a21',
    '    tall', '      single',
    '    b)cloud(', '    c{{hex}}', '      c1', '      c2', '      c3',
    '    id["`two<br/>lines<br/>three`"]',
    '    z', '      z1',
  ].join('\n');
  const { doc, pos } = lay(text);
  const all = flat(doc.root).map((n) => pos.get(n.uid));
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) assert.ok(!overlaps(all[i], all[j]), `nodes ${i} and ${j} overlap`);
});

test('bounds enclose every node', () => {
  const { pos, bounds } = lay('mindmap\n  root\n    a\n    b\n      c');
  for (const p of pos.values()) {
    assert.ok(p.x >= bounds.minX && p.x + p.w <= bounds.maxX);
    assert.ok(p.y >= bounds.minY && p.y + p.h <= bounds.maxY);
  }
});

test('labelLines unwraps markdown/quoted strings and splits on newlines and <br>', () => {
  assert.deepEqual(labelLines({ text: '"`a\nb`"' }), ['a', 'b']);
  assert.deepEqual(labelLines({ text: '"quoted"' }), ['quoted']);
  assert.deepEqual(labelLines({ text: 'x<br/>y<br>z' }), ['x', 'y', 'z']);
  assert.deepEqual(labelLines({ text: '' }), ['']);
});

test('multi-line nodes are taller', () => {
  const { doc, pos } = lay('mindmap\n  root\n    one\n    t<br/>w<br/>o');
  const [one, three] = doc.root.children;
  assert.ok(pos.get(three.uid).h > pos.get(one.uid).h);
});

test('collapsed nodes hide their descendants and free their space', () => {
  const { doc } = parse('mindmap\n  root\n    a\n      a1\n      a2\n    b');
  const a = doc.root.children[0];
  const full = layout(doc.root, measure);
  const small = layout(doc.root, measure, METRICS, new Set([a.uid]));
  assert.ok(full.pos.has(a.children[0].uid));
  assert.ok(!small.pos.has(a.children[0].uid));
  assert.ok(small.pos.has(a.uid) && small.pos.has(doc.root.children[1].uid));
  assert.ok(small.bounds.maxY < full.bounds.maxY);
});
