# Step 3 report – layout + read-only rendering with pan/zoom

## Added
- `public/layout.js` – pure `layout(root, measure)` → `{ pos: Map(uid → {x,y,w,h,depth,lines}), bounds }`; `labelLines(node)`; `METRICS`.
  Horizontal tidy tree: x by depth column (width = widest node in that column), leaf rows get sequential y, parent centred on its first/last child. Tall parents that would collide with a node already in their column push their subtree down. Shapes get extra padding so text fits (circle, bang, cloud, hexagon). Multi-line labels (markdown strings, `<br>`) increase node height.
- `public/render.js` – `renderTree` (SVG: bezier links + per-shape `<g data-uid>`; all text via `textContent`), `makeMeasure` (cached canvas `measureText`), `attachPanZoom` (pointer drag pan, wheel zoom about the cursor, two-finger pinch, `fit(bounds)`), `hitTest`.
- `public/app.js` – minimal wiring: sample mindmap → textarea; debounced (250 ms) input → parse → layout → render. On parse error an inline message is shown and the last valid drawing is kept. Fits the view on first render only, so later edits don't reset pan/zoom.
- `test/layout.test.js` – 7 tests (ordering, centring, column alignment, no overlaps across mixed shapes/heights, bounds, label parsing, taller multi-line nodes).

## Changed
- `public/index.html`: loads `app.js` as a module; added a **Fit** button and a `#status` element.
- `public/style.css`: canvas/pan styles, status banner, depth-coloured nodes and links, dark-mode variants.

## Verification
- `npm test`: 30/30 pass (23 from step 2 + 7 new).
- Not yet checked in a browser by me: visual appearance, wheel/pinch feel and touch behaviour need a manual look via `npm run dev`.

## Notes
- Panning starts anywhere on the canvas for now (read-only); step 5 will make drags that start on a node move that node instead.
- Selection, editing, collapse and localStorage are deliberately not part of this step.
