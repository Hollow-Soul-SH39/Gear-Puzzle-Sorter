# Gear Puzzle Sorter

Static web app that reads a chip-and-peg sort board from a **photo or camera**, then auto-solves it.

Photos never leave the device. There is no backend, no account, and no secrets.

## Live site

https://hollow-soul-sh39.github.io/Gear-Puzzle-Sorter/

Static files live at the repo root on `main`. Enable Pages once (repo admin):

**Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/` (root) → Save.**

## Run locally

From this folder:

```bash
python3 -m http.server
```

Open http://127.0.0.1:8000/

## What it does

1. **Scan** — Upload a photo or use the camera. Detection is adaptive: any chip colors, any rectangular grid size.
2. **Fail closed** — If the photo is blank, noisy, or not a readable grid, you get a clear error. The app does **not** invent a board.
3. **Edit** — Fix chips and pegs by hand: paint, delete, add/remove pegs, change stack height.
4. **Solve** — Pours matching top chips between pegs until each color lives on one peg.
5. **Play / Step / Reset** — Watch the sort, step one move, or return to the starting board.

A **Load sample** board is included so you can try solve + playback without a photo.

## Rules

- Each column is a peg. Colored chips stack from the bottom.
- A move pours the top run of one color onto another peg if that peg is empty or shows the same color and has room.
- Two empty pegs are added after a scan when the photo has no free working space.

## Tests

```bash
node tests/run.js
```

Browser smoke (with the local server running): open http://127.0.0.1:8000/tests/browser-smoke.html
