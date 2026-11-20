import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseNodeText } from '../public/parser.js';
import { serialize } from '../public/serializer.js';

const rt = (x) => {
  const r = parse(x);
  assert.deepEqual(r.errors, [], 'unexpected parse errors');
  return serialize(r.doc);
};

// Already-normalised inputs must round-trip byte for byte.
const stable = {
  'all shapes': [
    'mindmap',
    '  root((Title))',
    '    [Square]',
    '    (Rounded)',
    '    ((Circle))',
    '    ))Bang((',
    '    )Cloud(',
    '    {{Hexagon}}',
    '    Plain text node',
  ].join('\n'),
  'ids on shapes': [
    'mindmap',
    '  r1((Root))',
    '    a[Square]',
    '    b(Round)',
    '    c{{Hex}}',
  ].join('\n'),
  'icons and classes': [
    'mindmap',
    '  root',
    '    Tools',
    '    ::icon(fa fa-book)',
    '    :::urgent large',
    '      Child',
    '      ::icon(mdi mdi-skull-outline)',
  ].join('\n'),
  'comments': [
    'mindmap',
    '  %% about root',
    '  root',
    '    %% about child',
    '    child',
    '  %% trailing',
  ].join('\n'),
  'front matter and init': [
    '---',
    'title: Demo',
    '---',
    '%%{init: {"theme": "forest"}}%%',
    'mindmap',
    '  root',
    '    a',
  ].join('\n'),
  'markdown string': [
    'mindmap',
    '  id1["`**Root** with _emphasis_`"]',
    '    "`plain **bold**`"',
  ].join('\n'),
  'multiline markdown string': [
    'mindmap',
    '  id1["`line one',
    'line two`"]',
    '    child',
  ].join('\n'),
  'deep nesting': [
    'mindmap',
    '  a',
    '    b',
    '      c',
    '        d',
    '      e',
    '    f',
  ].join('\n'),
};

for (const [name, text] of Object.entries(stable)) {
  test(`stable round-trip: ${name}`, () => {
    assert.equal(rt(text), text);
  });
}

// Messy inputs normalise to a canonical form.
test('4-space indentation is normalised to 2', () => {
  assert.equal(rt('mindmap\n    root\n        a\n            b\n        c'), 'mindmap\n  root\n    a\n      b\n    c');
});

test('tabs are normalised', () => {
  assert.equal(rt('mindmap\n\troot\n\t\ta\n\t\t\tb\n\t\tc'), 'mindmap\n  root\n    a\n      b\n    c');
});

test('inconsistent indent widths still nest sensibly', () => {
  const r = parse('mindmap\n  root\n      a\n    b\n          c\n   d');
  assert.deepEqual(r.errors, []);
  const root = r.doc.root;
  // a (6), b (4), d (3) are all > 2 and pop previous siblings -> children of root
  assert.deepEqual(root.children.map((n) => n.text), ['a', 'b', 'd']);
  assert.deepEqual(root.children[1].children.map((n) => n.text), ['c']);
});

test('CRLF line endings and blank lines', () => {
  assert.equal(rt('mindmap\r\n\r\n  root\r\n\r\n    a\r\n'), 'mindmap\n  root\n    a');
});

test('missing header yields warning and gets a header', () => {
  const r = parse('root\n  a');
  assert.equal(r.warnings.length, 1);
  assert.equal(serialize(r.doc), 'mindmap\n  root\n    a');
});

test('pasted ```mermaid fence is stripped', () => {
  assert.equal(rt('```mermaid\nmindmap\n  root\n    a\n```\n'), 'mindmap\n  root\n    a');
});

test('header/decoration normalisation: icon after classes is re-emitted icon first', () => {
  assert.equal(rt('mindmap\n  root\n  :::c\n  ::icon(x)'), 'mindmap\n  root\n  ::icon(x)\n  :::c');
});

test('output is idempotent', () => {
  const messy = 'mindmap\n\troot((R))\n      a\n   ::icon(i)\n\t\t%% c\n\t\tb[B]\n';
  const once = rt(messy);
  assert.equal(rt(once), once);
});

// Structure checks.
test('parseNodeText detects shapes, ids and text', () => {
  assert.deepEqual(parseNodeText('root((Title))'), { id: 'root', shape: 'circle', text: 'Title' });
  assert.deepEqual(parseNodeText('))Boom(('), { id: null, shape: 'bang', text: 'Boom' });
  assert.deepEqual(parseNodeText(')Cloud('), { id: null, shape: 'cloud', text: 'Cloud' });
  assert.deepEqual(parseNodeText('{{Hex}}'), { id: null, shape: 'hexagon', text: 'Hex' });
  assert.deepEqual(parseNodeText('hello world'), { id: null, shape: 'default', text: 'hello world' });
});

test('decorations attach to the preceding node', () => {
  const { doc } = parse('mindmap\n  root\n    a\n    ::icon(fa fa-x)\n    :::big\n    b');
  const [a, b] = doc.root.children;
  assert.equal(a.icon, 'fa fa-x');
  assert.equal(a.classes, 'big');
  assert.equal(b.icon, null);
});

test('comments attach to the following node; trailing ones go to doc.trailing', () => {
  const { doc } = parse('mindmap\n  root\n    %% c1\n    a\n  %% end');
  assert.deepEqual(doc.root.children[0].comments, ['%% c1']);
  assert.deepEqual(doc.trailing, ['%% end']);
});

test('every node gets a unique uid', () => {
  const { doc } = parse('mindmap\n  r\n    a\n    b\n      c');
  const uids = [];
  (function walk(n) { uids.push(n.uid); n.children.forEach(walk); })(doc.root);
  assert.equal(new Set(uids).size, 4);
});

// Errors never throw; they return doc: null.
test('multiple roots is an error', () => {
  const r = parse('mindmap\n  root1\n  root2');
  assert.equal(r.doc, null);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].line, 3);
});

test('empty input is an error', () => {
  const r = parse('');
  assert.equal(r.doc, null);
  assert.equal(r.errors.length, 1);
});

test('unterminated markdown string is an error', () => {
  const r = parse('mindmap\n  id["`oops\n    child');
  assert.equal(r.doc, null);
  assert.match(r.errors[0].message, /Unterminated/);
});
