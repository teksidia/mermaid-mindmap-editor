# Step 6 report – undo/redo, clipboard toolbar, collapse, polish

## Added
- `public/history.js` – `createHistory()`: snapshot stack of serialized text (cap 200); new edits drop the redo branch, duplicates are ignored.
- `test/history.test.js` (3 tests); a collapse test in `test/layout.test.js`.
- `tree.resolve(root, path)` – exact path lookup (no ancestor fallback).

## Changed
- **Undo/redo** (`app.js`): snapshots are pushed after every canvas edit and after each valid, debounced textarea edit (invalid text is never put on the stack). Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z / Ctrl+Y work everywhere except inside the inline node editor (which keeps native undo). A pending debounced edit is flushed first, so undo never skips your last typing. Toolbar Undo/Redo buttons reflect availability. Accidental drags/deletes are now recoverable.
- **Collapse** – each node with children has a toggle on its right edge ("−" when open, hidden-descendant count when folded). Click it, press Space, or press → on a folded node. Folded subtrees are not laid out, so the tree re-packs. Adding a child or dropping a node into a folded node expands it; hiding the selected node moves selection to its visible ancestor. Fold state is view-only (never written into the mermaid text); it is kept by tree position across text edits and persisted.
  - `layout(root, measure, metrics, collapsed)` takes an optional set of collapsed uids; `renderTree` skips hidden nodes and draws the toggle. The "+" button moved slightly right to make room.
- **Toolbar** (`index.html`, `app.js`):
  - *Copy code* (Clipboard API with an `execCommand` fallback, "Copied ✓" feedback) which always copies the code wrapped in a ```mermaid block (what Obsidian expects); there is no option to copy raw code.
  - *Paste & load* (clipboard read; normalises fences/indentation when the text is valid; shows a hint if the browser blocks reading).
  - *Download .md* (always fenced, ready for Obsidian), *New* and *Sample* (both undoable), *Fit*.
- **Persistence**: `mmEditor.v1` now stores `{ text, collapsed (paths) }`.
- **Touch**: double-tap on a node starts editing (dblclick is unreliable on touch); the toolbar wraps on narrow screens; "+" and fold toggles are visible for the selected node without hover.
- `dnd.js` option renamed `hitAdd` → `hitControl` (ignores presses on both the "+" and fold buttons); ghost drops its controls.

## Verification
- `npm test`: 51/51 pass; all `public/*.js` pass `node --check`.
- **Not verified in a browser by me**: undo/redo flow, fold toggles, clipboard buttons (permission prompts differ per browser), and real touch devices. Please run `npm run dev` and try them, especially on a phone/tablet viewport.

## Known gaps
- Touch has no Tab/Enter equivalent for "add sibling" (use the "+" on the parent, or drag).
- Fold state is lost for a node if a text edit changes the tree above/before it (it is matched by position).
- The optional draggable pane divider and radial layout were not attempted.
