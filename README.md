# Chess Coach (phases 1–4)

Static site for GitHub Pages. Fetches your Chess.com games (or a PGN upload), analyzes them with Stockfish in your browser,
and shows per-time-control dashboards, a time-of-day heatmap, and a move-graded game review. Data is stored in this browser (IndexedDB).

## Setup
1. `./scripts/vendor.sh` (needs Node/npm) — downloads Stockfish lite WASM and cm-chessboard into `vendor/`. Commit the `vendor/` folder.
2. Test locally: `python -m http.server` then open http://localhost:8000 (ES modules and workers need http, not file://).
3. Push to GitHub, then Settings → Pages → deploy from the main branch.

## How analysis runs
Newest game first at depth 18, then every other game newest → oldest at depth 12. Pauses while the tab is hidden; resumes on return.
Use Export regularly to back up your analysis.

## Phase 3
- **Plan**: top 3 weaknesses (mistakes/blunders per 100 moves by phase and colour), weekly checklist, daily routine.
- **Blunder Rewind**: 5 puzzles per session from your own mistakes (positions that weren't already lost). Solved puzzles don't return.

## Phase 4
- **Overlays** (game review): 📌 pins to the king, 🍴 forks, ⚠️ undefended pieces, drawn over the board with a plain-English list.
- **Opening Galaxy**: your first 5 moves per colour as a force graph. Grey = barely played; no opening book yet, so truly unexplored lines can't be shown.
- **Trap Warnings**: positions in your first 12 moves where you made a mistake at least twice; one-move drill for each. Flagged on the Plan page.
- **Grading** now includes Excellent and Brilliant. Older analyses re-run automatically (analysis version 2).
