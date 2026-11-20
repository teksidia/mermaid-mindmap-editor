// Tree model -> Mermaid `mindmap` text (2-space indent, no trailing newline).
import { SHAPES } from './parser.js';

export function nodeLine(node) {
  const pair = SHAPES[node.shape];
  if (!pair) return node.text; // 'default': plain text, no id possible
  return (node.id || '') + pair[0] + node.text + pair[1];
}

function emit(node, depth, out) {
  const pad = '  '.repeat(depth);
  for (const c of node.comments || []) out.push(pad + c);
  out.push(pad + nodeLine(node));
  if (node.icon != null) out.push(pad + '::icon(' + node.icon + ')');
  if (node.classes != null) out.push(pad + ':::' + node.classes);
  for (const child of node.children) emit(child, depth + 1, out);
}

export function serialize(doc) {
  const out = [...(doc.preamble || []), 'mindmap'];
  emit(doc.root, 1, out);
  for (const c of doc.trailing || []) out.push('  ' + c);
  return out.join('\n');
}
