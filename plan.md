# Mermaid Mindmap Editor – Plan

## Context
The user generates Mermaid `mindmap` code with AI, wants to tweak it visually (add / delete / move nodes via drag and drop), then paste the result into Obsidian. Directory is empty (greenfield, not a git repo). Goals: very lightweight, deployed on Cloudflare, persistence only in localStorage.

## Key decisions
- **Do not embed mermaid.js** (~1MB+, render-only, no node identity, no drag/drop). Write a small own parser + serializer + renderer for the mindmap subset. Mermaid's mindmap grammar is indentation-based and tiny, so this is cheap.
- **Zero dependencies, no build step.** Plain ES modules + one HTML + one CSS in `public/`. Total payload target < 40KB.
- **Cloudflare: static assets only** (Workers Static Assets). No Worker script needed; `wrangler.jsonc` with `assets.directory = "./public"`. Deploy with `npx wrangler deploy`.
- **Source of truth is a tree model.** Code text <-> tree is two-way: edits to the textarea re-parse; edits on the canvas re-serialize.
- **Lossless round-trip is the main correctness requirement** (the user pastes it back into Obsidian), so each node stores its raw metadata, not just text.

## Files
```
wrangler.jsonc            # name, compatibility_date, assets.directory=./public
package.json              # scripts: dev (wrangler dev), deploy, test (node --test)
public/index.html         # layout: code pane (textarea) | canvas pane, toolbar
public/style.css
public/app.js             # wiring: state, localStorage, events, undo/redo
public/parser.js          # mermaid text -> tree
public/serializer.js      # tree -> mermaid text
public/layout.js          # tree -> x/y positions
public/render.js          # tree -> SVG, hit-testing
public/dnd.js             # drag/drop + keyboard interactions
test/roundtrip.test.js    # node:test, parser/serializer (+ tree ops)
```

## Data model
`Node { uid, id?, text, shape, icon?, classes?, comment lines?, children[] }`
- `shape` ∈ default | square `[ ]` | rounded `( )` | circle `(( ))` | bang `)) ((` | cloud `) (` | hexagon `{{ }}`.
- `id` is the optional Mermaid node id before the shape (`root((Title))`), preserved.
- Multiline/markdown strings (backtick `"` strings) preserved verbatim in `text`.
- `::icon(...)` and `:::class` lines attach to the preceding node (stored raw, re-emitted directly beneath it).
- `%%` comments and unrecognized lines are preserved as raw lines attached to the nearest node so nothing is silently dropped.
- Top-level: optional front matter / `%%{init}%%` block and `mindmap` header kept verbatim.
- Tab vs space indentation normalised on parse; output uses 2 spaces (Obsidian-safe). Multiple roots in pasted text: wrap under a synthetic-free warning (Mermaid allows only one root) — surface a message rather than guessing.

## Parser / serializer (`parser.js`, `serializer.js`)
- Parser: stack of (indent, node); line indent > stack top = child, otherwise pop to matching level. Tolerates inconsistent indent widths (common from AI output).
- Shape detection by regex on the line after the optional id.
- Serializer: depth-first, 2 spaces per level, re-wraps text in its original shape delimiters.
- Parse errors never destroy the canvas: show inline error and keep last valid tree.

## Layout & rendering (`layout.js`, `render.js`)
- Use a simple **horizontal tidy tree** (root left, children right) as default; it is easy to read and makes drop targets predictable. A "radial/both sides" mode is a later nice-to-have.
- Algorithm: leaf rows get sequential y; parent y = mean of children; x by depth using measured text widths (measure with a canvas `measureText`, cached).
- Render as one inline **SVG** (curved bezier links + rounded rect/shape nodes via `<g>` per node with `data-uid`). Pan (drag background) and zoom (wheel / pinch) via a viewBox/transform on a root `<g>`. Collapse/expand toggle per node.
- Re-render the whole tree on each change (trees are small); no virtual DOM needed.

## Interactions (`dnd.js`, `app.js`)
- **Select** a node by click. **Edit text** with double-click or F2 (inline `<input>` over the node); Enter commits, Esc cancels.
- **Add**: `Tab` = add child, `Enter` = add sibling below, hover "+" button on node; new node enters edit mode immediately.
- **Delete**: `Delete`/`Backspace` on selection (deletes subtree; undo available). Root cannot be deleted.
- **Move via drag and drop** using Pointer Events (works for mouse and touch):
  - Drag a node (subtree travels with it); show ghost + drop indicator.
  - Drop zones computed from layout: onto a node = become its last child; above/below a node's edge = insert as sibling before/after. Disallow dropping into own descendant.
  - Sibling reordering and re-parenting both fall out of the same operation `moveNode(uid, newParentUid, index)`.
- Tree ops are pure functions on the model: `addChild`, `addSibling`, `remove`, `move`, `rename`.
- After every canvas change: serialize -> write to textarea (preserving scroll) -> save to localStorage. Textarea `input` (debounced ~250ms) -> parse -> render.
- **Undo/redo**: snapshot stack of serialized text (cheap, since text is the canonical form); Ctrl+Z / Ctrl+Shift+Z.
- **Toolbar**: Copy code (Clipboard API, with "Copied" feedback), Paste & load (button for clipboard read), New/clear, sample mindmap, fit-to-view, download `.md` optional.
- **Persistence**: `localStorage` key `mmEditor.v1` storing the text only (plus view prefs). Restore on load; fall back to a sample.

## Layout of the page
Two panes side by side (code left, canvas right, draggable divider optional); stacked on narrow screens. Dark/light follows `prefers-color-scheme`. Optionally wrap the code in an Obsidian-ready fenced block toggle ("Copy as ```mermaid block") since that is what Obsidian expects — default copy gives raw code; the toggle is remembered.

## Build order
1. Scaffold `wrangler.jsonc`, `package.json`, `public/index.html`, confirm `wrangler dev` serves it.
2. `parser.js` + `serializer.js` with tests (round-trip fixtures: all shapes, icons, classes, comments, markdown strings, messy indentation, tabs).
3. `layout.js` + `render.js`: read-only display of pasted code, pan/zoom.
4. Selection, inline edit, add, delete, tree ops + sync with textarea + localStorage.
5. Drag and drop (move/reparent/reorder) with drop indicators.
6. Undo/redo, copy/paste toolbar, collapse, polish, touch testing.
7. Deploy.

## Verification
- `npm test`: round-trip tests assert `serialize(parse(x)) === normalize(x)` for fixtures and tree-op tests (move into descendant rejected, reorder indices, delete subtree).
- `npx wrangler dev`, then manually in browser: paste AI-generated mindmap -> renders; add child/sibling, delete, drag to re-parent and reorder -> code pane updates each time; copy code; reload -> state restored from localStorage.
- Paste the output into Obsidian (```mermaid block) and confirm it renders identically in structure; also check it against mermaid.live as a validity check.
- Edge cases: malformed paste (error shown, canvas kept), very large tree (~500 nodes responsive), touch drag on a mobile viewport.
- `npx wrangler deploy` and smoke-test the workers.dev URL.

## After Each Step

- Create a report-step[x].md detailing what changes were implemented.

## Open choices (defaults chosen, easy to change)
- Horizontal tree layout first; radial later.
- Vanilla JS rather than a framework to keep it tiny.
