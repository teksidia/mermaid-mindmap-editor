# Step 2 report – parser + serializer with tests

## Added
- `public/parser.js` – `parse(text)` → `{ doc, errors, warnings }`; also exports `createNode`, `newUid`, `parseNodeText`, `SHAPES`.
- `public/serializer.js` – `serialize(doc)` and `nodeLine(node)`.
- `test/roundtrip.test.js` – 23 `node:test` cases.

## Changed
- `package.json`: `test` script is now `node --test "test/*.test.js"` (passing a bare directory fails on Node 22).

## Behaviour
- **Model**: `doc = { preamble[], root, trailing[] }`; node = `{ uid, id, text, shape, icon, classes, comments[], children[] }`.
- **Shapes**: default, square, rounded, circle, bang, cloud, hexagon, with optional node id preserved (`root((Title))`).
- **Indentation**: stack-based; tabs count as 4 columns, inconsistent widths nest by "pop until smaller indent". Output is always 2 spaces.
- **Preserved**: front matter / `%%{init}%%` (verbatim preamble), `%%` comments (attached above the following node; trailing ones kept at end), `::icon(...)` and `:::classes` (attached to preceding node), markdown strings including multi-line ones.
- **Normalised** (intentional): blank lines dropped, `::icon` is emitted before `:::classes`, missing `mindmap` header is added (with a warning), a pasted ```` ```mermaid ```` fence is stripped.
- **Errors** return `doc: null` so the app can keep the last valid tree: multiple roots (reported with line number, not guessed), no root, unterminated markdown string.
- A duplicate `::icon`/`:::class` on one node is kept as a comment line instead of being dropped.

## Verification
`npm test` → 23 tests, 23 pass (stable round-trip for all shapes/ids/icons/classes/comments/front matter/markdown strings/nesting; normalisation of 4-space, tabs, CRLF, inconsistent indent; idempotence; error cases).

## Notes for later steps
- Tree ops (`addChild`, `move`, …) are planned for step 4; `createNode` is ready for them.
- Ordering of icon vs. class lines and the position of comments are the only places output may differ structurally from input.
