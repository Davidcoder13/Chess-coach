// Opening book: Lichess chess-openings dataset (CC0), files a.tsv..e.tsv with columns eco, name, pgn.
// Looks in data/openings/ first, then falls back to GitHub. Keyed by SAN move sequence (checks stripped).
export const norm = s => s.replace(/[+#]/g, '');
let cache;
export async function loadBook() {
  if (cache) return cache;
  const book = new Map();
  for (const f of ['a', 'b', 'c', 'd', 'e']) {
    let txt = '';
    for (const url of [`data/openings/${f}.tsv`, `https://raw.githubusercontent.com/lichess-org/chess-openings/master/${f}.tsv`]) {
      try { const r = await fetch(url); if (r.ok) { txt = await r.text(); break; } } catch {}
    }
    for (const line of txt.split('\n').slice(1)) {
      const [eco, name, pgn] = line.split('\t'); if (!pgn) continue;
      const sans = norm(pgn.replace(/\d+\.(\.\.)?/g, ' ')).trim().split(/\s+/);
      book.set(sans.join(' '), { eco, name, ply: sans.length });
    }
  }
  return (cache = book);
}
// Deepest named opening that the game's first moves pass through.
export function classify(sans, book, maxPly = 24) {
  const t = sans.slice(0, maxPly).map(norm);
  for (let i = t.length; i > 0; i--) { const e = book.get(t.slice(0, i).join(' ')); if (e) return e; }
  return null;
}