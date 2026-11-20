# Mermaid Mindmap Editor

A small web page for tidying up mind maps, so you can get them into your notes without hand-editing code.

## What is it?

If you use an AI assistant to brainstorm, it can write you a mind map as a block of text in a format called **Mermaid**. Obsidian (the note-taking app) can turn that text into a picture. The catch: the AI's first attempt is rarely perfect, and fixing it means editing indented text by hand, which is fiddly.

This editor lets you fix it **visually** instead:

1. **Paste** the AI's mind map code into the left-hand panel.
2. The mind map appears on the right as a picture.
3. **Change it with your mouse or keyboard** – rename ideas, add new ones, delete ones you don't want, and drag ideas around to reorder them or move them under a different branch.
4. Click **Copy code** and paste the result straight into Obsidian.

The code on the left and the picture on the right always stay in sync, so you can work in whichever you prefer.

## What you can do

| I want to… | How |
|---|---|
| Select an idea | Click it |
| Rename it | Double-click it (or press F2), then Enter |
| Add a sub-idea | Press Tab, or click the **+** next to it |
| Add an idea beside it | Press Enter |
| Delete an idea (and everything under it) | Press Delete |
| Move an idea | Drag it onto another idea (becomes its child) or onto its top/bottom edge (becomes its neighbour) |
| Hide / show a branch | Click the small circle on its right edge, or press Space |
| Move around / zoom | Drag the background; scroll wheel or pinch to zoom; **Fit** re-centres |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z (or the buttons) |
| Start over / try an example | **New** / **Sample** (both can be undone) |
| Use it in Obsidian | **Copy code** – it is copied ready to paste as a Mermaid block |
| Keep a file | **Download .md** |

If you paste something that isn't a valid mind map, you get a clear message and your picture is left untouched.

## Your data stays with you

Everything you make is saved automatically **in your own browser** (so it is still there when you come back). Nothing is sent to a server, there are no accounts, and no tracking.

## The tech, briefly

- **Plain web technology only** – HTML, CSS and JavaScript. No frameworks, no libraries, no build step. The whole app is only a few small files, so it loads almost instantly.
- **Hand-written Mermaid reader and writer** – instead of loading the large official Mermaid library, the app has its own small parser for the mind map format. It is careful to preserve things like icons, styles, comments and shapes so your map comes back out the way it went in.
- **SVG drawing** – the mind map is drawn as scalable vector graphics, which stay sharp at any zoom level.
- **Browser storage** – your work is kept in the browser's `localStorage`.
- **Hosted on Cloudflare** – published as static files with Cloudflare Workers (using the `wrangler` tool).
- **Automated tests** – the core logic (reading/writing Mermaid, layout, editing, drag-and-drop rules, undo) is covered by tests that run with Node.js's built-in test runner.

## Built 100% with Claude Code

Every line of this project – the code, the tests, the styling and this document – was written by **Claude Code**, Anthropic's AI coding assistant, working from plain-English instructions. No code was written by hand.

How it went:

1. **A plan first.** Claude Code produced a written plan (`plan.md`) covering the goals, design decisions and a seven-step build order.
2. **One step at a time.** The human asked for each step in turn ("implement step 2", "now do step 3", …). Claude Code wrote the code, ran the tests, fixed what failed, and moved on.
3. **A report after every step.** Each step ended with a short write-up (`report-step1.md`, `report-step2.md`, …) describing exactly what changed and what was and wasn't verified.
4. **Small requests, small changes.** Later tweaks – such as "always copy as a Mermaid block, and remove the checkbox" – were just one-sentence requests that Claude Code carried out and documented.

The step reports in this folder are a faithful record of how the project grew.

## For developers

```
npm install        # one-time
npm run dev        # run locally (wrangler dev)
npm test           # run the test suite
npm run deploy     # publish to Cloudflare
```

Source lives in `public/` (`parser.js`, `serializer.js`, `layout.js`, `render.js`, `tree.js`, `dnd.js`, `history.js`, `app.js`); tests are in `test/`.
