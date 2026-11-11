# Chess Coach (v2.0)

A client-side chess coaching and game review platform designed for GitHub Pages. Fetches your Chess.com games (or PGN uploads), analyzes them with Stockfish in your browser via WebAssembly, and delivers personalized training routines, blunder rewind puzzles, and opening insights. All data is persisted locally in your browser (IndexedDB).

## Features

- **Personalized Training Plan**: Top weaknesses breakdown (by game phase and color), weekly checklists, and daily tactical workouts.
- **Blunder Rewind Puzzles**: Daily 5-puzzle training sessions generated directly from your actual game mistakes, complete with interactive step progress and haptic sound effects.
- **Game Review & Live Evaluation Bar**:
  - Vertical animated evaluation bar showing centipawn / mate advantage.
  - Tactical overlay visualizing pins (📌), forks (🍴), and hanging pieces (⚠️).
  - AI Coach speech bubbles explaining blunders in plain English with alternative moves.
  - Accuracy comparison widget (White vs. Black accuracy score & move classification breakdown).
  - 2-column move table with auto-scroll and move quality badges.
  - Controls: First (`Home`), Prev (`←`), Autoplay (`Space`), Next (`→`), Last (`End`), and Flip Board (`F`).
- **Interactive Opening Galaxy**:
  - D3 force-directed tree graph mapping your opening repertoire.
  - Color coded nodes (green = strong, orange = trouble lines, grey = rarely played).
  - Unexplored book lines ("ghosts") using Lichess opening datasets.
  - Smooth pan & zoom navigation.
  - Repertoire performance table with game counts and win percentages.
- **Trap Warnings**: Automatic detection of recurring blunders in the first 12 moves across your games with one-click drill mode.
- **When You Play Best**: Heatmap visualization of win rates across 24 hours × 7 days.
- **Audio & Haptics**: Built-in synthesized Web Audio effects for moves, captures, puzzle solutions, and errors (zero external audio dependencies).
- **Themes**: Modern dark (default) and light themes with smooth transitions.

## Setup & Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Verify vendor assets:
   ```bash
   npm run vendor
   ```
3. Run locally:
   ```bash
   npm run dev
   ```
   Open `http://localhost:8000` (ES modules and Web Workers require an HTTP server, not `file://`).

4. Deploy:
   Push to GitHub, then go to **Settings → Pages → Deploy from branch (main)**.

## Quality Checks

- `npm test`: Runs the Vitest engine regression suite.
- `npm run vendor`: Validates Stockfish 19 WASM and board assets.
