// Pure tree operations on the parsed model. All mutate `root`'s tree in place and
// return a result (or null/false when the operation is not allowed).
import { createNode, parseNodeText } from './parser.js';

export function find(root, uid) {
  const walk = (node, parent, index) => {
    if (node.uid === uid) return { node, parent, index };
    for (let i = 0; i < node.children.length; i++) {
      const r = walk(node.children[i], node, i);
      if (r) return r;
    }
    return null;
  };
  return walk(root, null, -1);
}

/** Child-index path from root to the node (root = []), or null. */
export function pathOf(root, uid) {
  const walk = (node, path) => {
    if (node.uid === uid) return path;
    for (let i = 0; i < node.children.length; i++) {
      const r = walk(node.children[i], [...path, i]);
      if (r) return r;
    }
    return null;
  };
  return walk(root, []);
}

/** Node at a path, or the deepest existing ancestor if the path no longer fits. */
export function nodeAt(root, path) {
  let n = root;
  for (const i of path) {
    if (!n.children[i]) break;
    n = n.children[i];
  }
  return n;
}

/** True if `uid` is `node` itself or inside its subtree. */
export function contains(node, uid) {
  return node.uid === uid || node.children.some((c) => contains(c, uid));
}

export function addChild(root, parentUid, node = createNode('New node'), index) {
  const p = find(root, parentUid);
  if (!p) return null;
  const kids = p.node.children;
  kids.splice(index === undefined ? kids.length : Math.max(0, Math.min(index, kids.length)), 0, node);
  return node;
}

/** Insert after `uid`. The root has no siblings, so it gets a child instead. */
export function addSibling(root, uid, node = createNode('New node')) {
  const f = find(root, uid);
  if (!f) return null;
  if (!f.parent) return addChild(root, uid, node);
  f.parent.children.splice(f.index + 1, 0, node);
  return node;
}

/** Remove a node and its subtree. Returns { parent, index } or null (root / unknown). */
export function remove(root, uid) {
  const f = find(root, uid);
  if (!f || !f.parent) return null;
  f.parent.children.splice(f.index, 1);
  return { parent: f.parent, index: f.index };
}

/**
 * Move a node (with its subtree) under `newParentUid`.
 * `index` is the position among the new parent's children *after* the moving
 * node has been taken out of the list; it is clamped to the valid range.
 * Rejected for the root and for drops into the node's own subtree.
 */
export function move(root, uid, newParentUid, index) {
  const f = find(root, uid);
  if (!f || !f.parent) return false;
  if (contains(f.node, newParentUid)) return false;
  const target = find(root, newParentUid);
  if (!target) return false;
  f.parent.children.splice(f.index, 1);
  const kids = target.node.children;
  kids.splice(index === undefined ? kids.length : Math.max(0, Math.min(index, kids.length)), 0, f.node);
  return true;
}

// ---- text editing --------------------------------------------------------

/** Text as shown in the inline editor (surrounding plain quotes removed). */
export function decodeText(node) {
  if (node.shape === 'default') {
    const m = /^"(?!`)([\s\S]*)"$/.exec(node.text);
    if (m) return m[1];
  }
  return node.text;
}

/**
 * Text as stored. A plain node whose text would be mis-read on re-parse
 * (looks like a shape, comment, class or icon line) is wrapped in quotes.
 */
export function encodeText(text, shape) {
  const t = String(text).replace(/\s*[\r\n]+\s*/g, ' ').trim();
  if (shape === 'default' && t && !/^".*"$/.test(t) &&
      (parseNodeText(t).shape !== 'default' || /^(%%|::|"`)/.test(t))) {
    return '"' + t.replace(/"/g, "'") + '"';
  }
  return t;
}

/** Returns false (and changes nothing) for unknown nodes or empty text. */
export function rename(root, uid, text) {
  const f = find(root, uid);
  if (!f) return false;
  const t = encodeText(text, f.node.shape);
  if (!t) return false;
  f.node.text = t;
  return true;
}

/** Node at exactly this path, or null (unlike nodeAt, no fallback). */
export function resolve(root, path) {
  let n = root;
  for (const i of path) {
    n = n.children[i];
    if (!n) return null;
  }
  return n;
}
