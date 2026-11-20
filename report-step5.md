# Step 5 report – drag and drop (move / re-parent / reorder)

## Added
- `public/dnd.js`
  - `computeDrop(root, pos, dragUid, x, y)` (pure): finds the nearest non-dragged node within 40px of the pointer (layout coordinates). Middle half of a node → last child; top/bottom quarter → sibling before/after (the root always gets a child). Returns `{ uid, kind, targetUid, parentUid, index }` where `index` follows the `tree.move` convention, or `null` for "nothing near" and "would not change anything". The dragged node and its descendants are never targets, so cycles can't be produced.
  - `attachDnd(...)`: Pointer Events (mouse + touch). A press on a non-root node becomes a drag after 5px; a ghost copy follows the pointer (grab offset preserved), the node and its subtree dim, and a drop indicator is shown. Release performs the move; Esc or pointer-cancel aborts. Plain clicks still select / double-clicks still edit.
- `test/dnd.test.js` – 6 tests (zones, root, own subtree, no-ops, and computed drops applied through `tree.move` for reorder backward/forward, re-parent, and moving a node up a level).

## Changed
- `public/render.js`: `attachPanZoom` accepts `{ shouldPan }`; added `showDropIndicator` (dashed box for "child", thick line for before/after) and `clearDropIndicator`.
- `public/app.js`: pan now only starts on empty canvas or the root (presses on other nodes belong to drag); `onDrop` calls `T.move`, selects the moved node, then `sync()` (textarea + localStorage update as for any canvas edit).
- `public/style.css`: grab cursors, dimmed dragged nodes, ghost, indicator styles.

## Verification
- `npm test`: 47/47 pass (41 earlier + 6 new).
- Not verified in a browser by me: the actual drag feel (ghost, indicator placement, touch) needs a manual check with `npm run dev`.

## Notes / limitations
- No auto-pan when dragging near the canvas edge; zoom out or Fit first for far targets.
- The layout isn't recomputed during a drag, so zones reflect the pre-drop tree.
- Undo/redo (step 6) will make accidental drops recoverable; until then, editing the code pane or reloading is the only way back.
