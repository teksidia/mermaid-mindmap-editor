// Wiring: state, localStorage, text <-> canvas sync, selection, inline editing,
// collapse, undo/redo and the toolbar.
// The textarea holds the canonical text; the in-memory `doc` is re-derived from it
// on typing, and written back to it after every canvas change.
import { parse } from './parser.js';
import { serialize } from './serializer.js';
import { layout } from './layout.js';
import { renderTree, attachPanZoom, makeMeasure, hitTest, hitAdd, hitToggle } from './render.js';
import { attachDnd } from './dnd.js';
import { createHistory } from './history.js';
import * as T from './tree.js';

const SAMPLE = `mindmap
  root((Mindmap))
    Origins
      Long history
      Popularisation
        British popular psychology author Tony Buzan
    Research
      On effectiveness and features
      On Automatic creation
        Uses
          Creative techniques
          Strategic planning
    Tools
      Pen and paper
      Mermaid`;
const BLANK = 'mindmap\n  root((Mindmap))';

const STORAGE_KEY = 'mmEditor.v1';

const $ = (id) => document.getElementById(id);
const code = $('code');
const svg = $('canvas');
const pane = svg.parentElement;
const status = $('status');

const viewport = document.createElementNS('http://www.w3.org/2000/svg', 'g');
viewport.setAttribute('class', 'viewport');
svg.appendChild(viewport);
svg.setAttribute('tabindex', '0');

// A press on a (non-root) node drags that node; anywhere else it pans the canvas.
const view = attachPanZoom(svg, viewport, {
  shouldPan: (e) => {
    const uid = hitTest(e.clientX, e.clientY);
    return !uid || (doc && uid === doc.root.uid);
  },
});
const measure = makeMeasure();

let doc = null;
let selected = null; // uid
let editing = null; // { uid, isNew, input, done }
let lastLay = null;
let first = true;
let collapsed = new Set(); // uids of nodes whose children are hidden
let pendingCollapsed = []; // paths restored from storage, applied on first parse
let history = null;

// ---- persistence ---------------------------------------------------------

function loadSaved() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && typeof s.text === 'string' && s.text.trim()) return s;
  } catch { /* corrupt or unavailable storage: fall back to the sample */ }
  return { text: SAMPLE };
}

/** Text + view prefs (collapsed nodes as tree paths). */
function save() {
  const paths = doc ? [...collapsed].map((u) => T.pathOf(doc.root, u)).filter(Boolean) : [];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ text: code.value, collapsed: paths }));
  } catch { /* quota / private mode: ignore */ }
}

// ---- drawing -------------------------------------------------------------

function showStatus(msg, kind) {
  status.textContent = msg;
  status.className = msg ? kind : '';
}

function draw() {
  lastLay = layout(doc.root, measure, undefined, collapsed);
  if (selected && !lastLay.pos.has(selected)) {
    // Selection got hidden by a collapse: fall back to its nearest visible ancestor.
    const path = T.pathOf(doc.root, selected) || [];
    for (let k = path.length; k >= 0; k--) {
      const n = T.resolve(doc.root, path.slice(0, k));
      if (n && lastLay.pos.has(n.uid)) { selected = n.uid; break; }
    }
  }
  renderTree(viewport, doc.root, lastLay, selected);
}

/**
 * Textarea text -> parse -> draw. Keeps the last valid tree on error.
 * `record` = push the text onto the undo stack (not when restoring from it).
 */
function update(record = true) {
  const { doc: next, errors, warnings } = parse(code.value);
  if (!next) {
    const e = errors[0];
    showStatus(`Line ${e.line}: ${e.message}`, 'error');
    save();
    return;
  }
  showStatus(warnings.length ? warnings[0].message : '', 'warn');
  // Node uids are regenerated on every parse, so carry selection and collapse state by position.
  const path = doc && selected ? T.pathOf(doc.root, selected) : null;
  const cpaths = doc ? [...collapsed].map((u) => T.pathOf(doc.root, u)).filter(Boolean) : pendingCollapsed;
  pendingCollapsed = [];
  doc = next;
  selected = (path ? T.nodeAt(doc.root, path) : doc.root).uid;
  collapsed = new Set(
    cpaths.map((p) => T.resolve(doc.root, p)).filter((n) => n && n.children.length).map((n) => n.uid),
  );
  draw();
  if (first) {
    first = false;
    view.fit(lastLay.bounds);
  }
  if (record && history.push(code.value)) refreshHistoryButtons();
  save();
}

/** Canvas edit -> serialize -> textarea + storage + history -> draw. */
function sync() {
  const top = code.scrollTop;
  code.value = serialize(doc);
  code.scrollTop = top;
  history.push(code.value);
  refreshHistoryButtons();
  save();
  showStatus('', '');
  draw();
}

// ---- undo / redo ---------------------------------------------------------

let timer = null;
/** Apply a pending debounced textarea edit right now (so it is on the undo stack). */
function flushPending() {
  if (timer === null) return;
  clearTimeout(timer);
  timer = null;
  update();
}

function restore(text) {
  if (text === null) return;
  finishEdit(false);
  code.value = text;
  update(false);
  refreshHistoryButtons();
}
function undo() { flushPending(); restore(history.undo()); }
function redo() { flushPending(); restore(history.redo()); }

function refreshHistoryButtons() {
  $('undo').disabled = !history.canUndo();
  $('redo').disabled = !history.canRedo();
}

/** Replace the whole document (New / Sample / Paste). Undoable. */
function loadText(text) {
  flushPending();
  finishEdit(false);
  collapsed.clear();
  code.value = text;
  update();
  first = false;
  if (lastLay) view.fit(lastLay.bounds);
}

// ---- selection -----------------------------------------------------------

function select(uid) {
  selected = uid;
  viewport.querySelectorAll('.node.selected').forEach((g) => g.classList.remove('selected'));
  if (uid) viewport.querySelector(`[data-uid="${uid}"]`)?.classList.add('selected');
  svg.focus({ preventScroll: true });
}

// ---- collapse ------------------------------------------------------------

function toggleCollapse(uid, force) {
  const f = T.find(doc.root, uid);
  if (!f || !f.node.children.length) return;
  const want = force === undefined ? !collapsed.has(uid) : force;
  if (want) collapsed.add(uid);
  else collapsed.delete(uid);
  selected = uid;
  draw();
  save();
  svg.focus({ preventScroll: true });
}

// ---- inline editing ------------------------------------------------------

function startEdit(uid, isNew = false) {
  finishEdit(true);
  const f = T.find(doc.root, uid);
  const g = viewport.querySelector(`[data-uid="${uid}"]`);
  if (!f || !g) return;
  if (f.node.text.includes('\n')) {
    showStatus('Multi-line text: edit it in the code pane.', 'warn');
    return;
  }
  const r = g.children[1].getBoundingClientRect(); // the shape element
  const pr = pane.getBoundingClientRect();
  const input = document.createElement('input');
  input.className = 'editor';
  input.value = T.decodeText(f.node);
  const w = Math.max(r.width, 96);
  Object.assign(input.style, {
    left: r.left - pr.left - (w - r.width) / 2 + 'px',
    top: r.top - pr.top + 'px',
    width: w + 'px',
    height: r.height + 'px',
    fontSize: 14 * view.get().k + 'px',
  });
  pane.appendChild(input);
  editing = { uid, isNew, input, done: false };
  input.focus();
  input.select();

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finishEdit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
    else if (e.key === 'Tab') { e.preventDefault(); finishEdit(true); addChild(uid); }
  });
  input.addEventListener('blur', () => finishEdit(true));
}

function finishEdit(commit) {
  const e = editing;
  if (!e || e.done) return;
  e.done = true;
  editing = null;
  const value = e.input.value;
  e.input.remove(); // fires blur; guarded by e.done
  if (commit && value.trim()) {
    if (T.rename(doc.root, e.uid, value)) sync();
  } else if (e.isNew) {
    deleteNode(e.uid);
  }
  svg.focus({ preventScroll: true });
}

// ---- actions -------------------------------------------------------------

function addChild(uid) {
  collapsed.delete(uid); // a new child must be visible
  const n = T.addChild(doc.root, uid);
  if (!n) return;
  selected = n.uid;
  sync();
  startEdit(n.uid, true);
}

function addSibling(uid) {
  const n = T.addSibling(doc.root, uid);
  if (!n) return;
  selected = n.uid;
  sync();
  startEdit(n.uid, true);
}

function deleteNode(uid) {
  const r = T.remove(doc.root, uid);
  if (!r) {
    showStatus('The root node cannot be deleted.', 'warn');
    return;
  }
  collapsed.delete(uid);
  const kids = r.parent.children;
  selected = (kids[r.index] || kids[r.index - 1] || r.parent).uid;
  sync();
}

function navigate(key) {
  const f = T.find(doc.root, selected);
  if (!f) return;
  let target = null;
  if (key === 'ArrowLeft') target = f.parent;
  else if (key === 'ArrowRight') {
    if (collapsed.has(f.node.uid)) { toggleCollapse(f.node.uid, false); return; }
    target = f.node.children[0];
  } else if (f.parent) target = f.parent.children[f.index + (key === 'ArrowDown' ? 1 : -1)];
  if (target) select(target.uid);
}

// ---- toolbar -------------------------------------------------------------

const fenced = (text) => '```mermaid\n' + text + '\n```';

function flash(btn, msg) {
  const old = btn.dataset.label || btn.textContent;
  btn.dataset.label = old;
  btn.textContent = msg;
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.textContent = old; }, 1300);
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea'); // fallback for insecure contexts
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

$('copy').addEventListener('click', async (e) => {
  flushPending();
  const text = fenced(code.value);
  flash(e.currentTarget, (await writeClipboard(text)) ? 'Copied ✓' : 'Copy failed');
});

$('paste').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) { showStatus('The clipboard is empty.', 'warn'); return; }
    const { doc: parsed } = parse(text);
    loadText(parsed ? serialize(parsed) : text); // normalise fences/indentation when valid
  } catch {
    showStatus('Clipboard read was blocked by the browser. Paste into the code pane instead.', 'warn');
  }
});

$('download').addEventListener('click', () => {
  flushPending();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([fenced(code.value) + '\n'], { type: 'text/markdown' }));
  a.download = 'mindmap.md';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('new').addEventListener('click', () => loadText(BLANK));
$('sample').addEventListener('click', () => loadText(SAMPLE));
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
$('fit').addEventListener('click', () => lastLay && view.fit(lastLay.bounds));

// ---- canvas events -------------------------------------------------------

let down = null;
let lastTap = null; // touch double-tap -> edit (dblclick is unreliable on touch)
svg.addEventListener('pointerdown', (e) => {
  finishEdit(true);
  down = { x: e.clientX, y: e.clientY };
});
svg.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4;
  down = null;
  if (moved) return; // it was a pan or a drag
  const addUid = hitAdd(e.clientX, e.clientY);
  if (addUid) { addChild(addUid); return; }
  const togUid = hitToggle(e.clientX, e.clientY);
  if (togUid) { toggleCollapse(togUid); return; }
  const uid = hitTest(e.clientX, e.clientY);
  select(uid);
  if (e.pointerType === 'touch' && uid) {
    const now = Date.now();
    if (lastTap && lastTap.uid === uid && now - lastTap.t < 350) { lastTap = null; startEdit(uid); }
    else lastTap = { uid, t: now };
  }
});
svg.addEventListener('dblclick', (e) => {
  if (hitAdd(e.clientX, e.clientY) || hitToggle(e.clientX, e.clientY)) return;
  const uid = hitTest(e.clientX, e.clientY);
  if (uid) startEdit(uid);
});

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey && !(editing)) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); return; }
  }
  if (editing || mod || e.altKey || !selected) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'TEXTAREA' || tag === 'INPUT') return;
  switch (e.key) {
    case 'Tab':
      if (e.shiftKey) return;
      e.preventDefault(); addChild(selected); break;
    case 'Enter': e.preventDefault(); addSibling(selected); break;
    case 'F2': e.preventDefault(); startEdit(selected); break;
    case ' ': e.preventDefault(); toggleCollapse(selected); break;
    case 'Delete':
    case 'Backspace': e.preventDefault(); deleteNode(selected); break;
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight': e.preventDefault(); navigate(e.key); break;
  }
});

attachDnd({
  svg, viewport, view, hitTest,
  hitControl: (x, y) => hitAdd(x, y) || hitToggle(x, y),
  getDoc: () => doc,
  getLayout: () => lastLay,
  onDrop: (d) => {
    if (T.move(doc.root, d.uid, d.parentUid, d.index)) {
      collapsed.delete(d.parentUid); // show where it landed
      selected = d.uid;
      sync();
    }
  },
});

code.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => { timer = null; update(); }, 250);
});
window.addEventListener('resize', () => lastLay && first && view.fit(lastLay.bounds));

// ---- start ---------------------------------------------------------------

const saved = loadSaved();
pendingCollapsed = Array.isArray(saved.collapsed) ? saved.collapsed : [];
code.value = saved.text;
history = createHistory(code.value);
update(false);
refreshHistoryButtons();
