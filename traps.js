// Trap Warnings: the same opening position where you keep going wrong.
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0/+esm';
const top = o => Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0];

export function findTraps(games, minCount = 2) {
  const groups = new Map();
  for (const g of games) {
    const pl = g.analysis?.plies; if (!pl?.length) continue;
    let mv; try { const c = new Chess(); c.loadPgn(g.pgn); mv = c.history({ verbose: true }); } catch { continue; }
    mv.slice(0, 24).forEach((m, i) => {
      const p = pl[i];
      if (!p || m.color !== g.color || !['mistake', 'blunder'].includes(p.grade)) return;
      const key = m.before.split(' ').slice(0, 4).join(' ');
      const t = groups.get(key) || { key, fen: m.before, color: g.color, best: p.best, plays: {}, punish: {}, n: 0, losses: 0 };
      groups.set(key, t); t.n++; if (g.result === 'loss') t.losses++;
      t.plays[m.san] = (t.plays[m.san] || 0) + 1;
      if (mv[i + 1]) t.punish[mv[i + 1].san] = (t.punish[mv[i + 1].san] || 0) + 1;
    });
  }
  return [...groups.values()].filter(t => t.n >= minCount).sort((a, b) => b.n - a.n);
}

export function renderTraps(el, games) {
  const puzzles = findTraps(games).map(t => {
    let bestSan = t.best; try { bestSan = new Chess(t.fen).move({ from: t.best.slice(0, 2), to: t.best.slice(2, 4), promotion: t.best[4] }).san; } catch {}
    const played = top(t.plays);
    return { id: 'trap:' + t.key, fen: t.fen, color: t.color, best: t.best, played, loss: 0, end_time: 0, bestSan, t,
      note: `That avoids it. You've played ${played} here ${t.n} times.` };
  });
  el.innerHTML = puzzles.length ? puzzles.map((p, i) => `<div class="tr"><b>Same position, ${p.t.n} mistakes</b> <span class="mute">(${p.t.losses} lost games)</span><br>
    You played <b>${p.played}</b>; opponents answered <b>${top(p.t.punish) || '?'}</b>. Safer: <b>${p.bestSan}</b>.
    <button data-drill="${i}">Drill it</button></div>`).join('')
    : '<p class="mute">No repeated traps yet. A trap shows up once you make a mistake in the same opening position at least twice in analyzed games.</p>';
  return puzzles;
}
