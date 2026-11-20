// Mermaid `mindmap` text -> tree model.
//
// Node: { uid, id, text, shape, icon, classes, comments[], children[] }
//   id       optional Mermaid node id written before the shape (root((Title)))
//   shape    'default' | 'square' | 'rounded' | 'circle' | 'bang' | 'cloud' | 'hexagon'
//   icon     raw content of ::icon(...) or null
//   classes  raw content after ::: or null
//   comments raw lines (%% comments, stray decorations) re-emitted above the node
//
// Document: { preamble[], root, trailing[] }
//   preamble verbatim lines before the `mindmap` header (front matter, %%{init}%%)
//   trailing raw comment lines that follow the last node

export const SHAPES = {
  circle: ['((', '))'],
  bang: ['))', '(('],
  hexagon: ['{{', '}}'],
  cloud: [')', '('],
  rounded: ['(', ')'],
  square: ['[', ']'],
};

// Order matters: longer delimiters must be tried before their prefixes.
const SHAPE_ORDER = ['circle', 'bang', 'hexagon', 'cloud', 'rounded', 'square'];

let uidCounter = 0;
export function newUid() {
  return 'n' + (++uidCounter);
}

export function createNode(text = '', shape = 'default', extra = {}) {
  return {
    uid: newUid(),
    id: null,
    text,
    shape,
    icon: null,
    classes: null,
    comments: [],
    children: [],
    ...extra,
  };
}

function indentOf(line) {
  let n = 0;
  for (const ch of line) {
    if (ch === ' ') n += 1;
    else if (ch === '\t') n += 4;
    else break;
  }
  return n;
}

// Split "id((text))" into { id, shape, text }. Anything else is a default node.
export function parseNodeText(s) {
  const m = /^([^\s()\[\]{}]*)/.exec(s);
  const id = m[1];
  const rest = s.slice(id.length);
  for (const shape of SHAPE_ORDER) {
    const [open, close] = SHAPES[shape];
    if (
      rest.startsWith(open) &&
      rest.endsWith(close) &&
      rest.length >= open.length + close.length
    ) {
      return {
        id: id || null,
        shape,
        text: rest.slice(open.length, rest.length - close.length),
      };
    }
  }
  return { id: null, shape: 'default', text: s };
}

function stripFences(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start++;
  while (end > start && lines[end - 1].trim() === '') end--;
  if (start < end && /^```\s*mermaid\s*$/i.test(lines[start].trim())) {
    start++;
    if (end > start && lines[end - 1].trim() === '```') end--;
  }
  return lines.slice(start, end);
}

/**
 * Parse mermaid mindmap text.
 * Returns { doc, errors, warnings }. `doc` is null when errors is non-empty,
 * so callers can keep their last valid tree.
 */
export function parse(text) {
  const errors = [];
  const warnings = [];
  const fail = (line, message) => errors.push({ line, message });

  const lines = stripFences(String(text).split(/\r\n|\r|\n/));

  // Preamble: everything before the `mindmap` header.
  let headerIdx = lines.findIndex((l) => /^\s*mindmap\s*$/.test(l));
  let preamble = [];
  if (headerIdx === -1) {
    warnings.push({ line: 1, message: 'No "mindmap" header found; assuming one.' });
    headerIdx = -1;
  } else {
    preamble = lines.slice(0, headerIdx);
    while (preamble.length && preamble[preamble.length - 1].trim() === '') preamble.pop();
  }

  const doc = { preamble, root: null, trailing: [] };
  const stack = []; // { indent, node }
  let last = null; // most recent node, target of ::icon / :::class
  let pending = []; // comment lines waiting for the next node

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (t === '') continue;

    if (t.startsWith('%%')) {
      pending.push(t);
      continue;
    }

    const iconM = /^::icon\((.*)\)$/.exec(t);
    const classM = !iconM && /^:::(.*)$/.exec(t);
    if (iconM || classM) {
      if (!last) {
        pending.push(t);
      } else if (iconM && last.icon === null) {
        last.icon = iconM[1];
      } else if (classM && last.classes === null) {
        last.classes = classM[1].trim();
      } else {
        // Duplicate decoration: keep it rather than drop it.
        last.comments.push(t);
      }
      continue;
    }

    // Multiline markdown string: "`...` spanning several lines.
    let body = t;
    const open = t.indexOf('"`');
    if (open !== -1 && t.indexOf('`"', open + 2) === -1) {
      const startLine = i + 1;
      const parts = [t];
      let closed = false;
      while (++i < lines.length) {
        parts.push(i === lines.length - 1 ? lines[i].trimEnd() : lines[i]);
        if (lines[i].includes('`"')) {
          closed = true;
          break;
        }
      }
      if (!closed) {
        fail(startLine, 'Unterminated markdown string (missing closing `").');
        break;
      }
      parts[parts.length - 1] = parts[parts.length - 1].trimEnd();
      body = parts.join('\n');
    }

    const indent = indentOf(raw);
    const node = createNode('', 'default', parseNodeText(body));
    node.comments = pending;
    pending = [];

    if (!doc.root) {
      doc.root = node;
      stack.push({ indent, node });
    } else {
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      if (!stack.length) {
        fail(i + 1, 'Multiple root nodes: Mermaid mindmaps allow exactly one root. Indent this line under the root.');
        break;
      }
      stack[stack.length - 1].node.children.push(node);
      stack.push({ indent, node });
    }
    last = node;
  }

  doc.trailing = pending;
  if (!errors.length && !doc.root) fail(1, 'No root node found.');
  return { doc: errors.length ? null : doc, errors, warnings };
}
