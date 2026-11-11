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
    let bestSan = t.best;
    try {
      bestSan = new Chess(t.fen).move({ from: t.best.slice(0, 2), to: t.best.slice(2, 4), promotion: t.best[4] }).san;
    } catch {}
    const played = top(t.plays);
    return {
      id: 'trap:' + t.key,
      fen: t.fen,
      color: t.color,
      best: t.best,
      played,
      loss: 0,
      end_time: 0,
      bestSan,
      t,
      note: `That avoids it! In games you played ${played} here ${t.n} times.`
    };
  });

  if (!puzzles.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🛡️</div>
        <h3>No opening traps detected yet</h3>
        <p>A trap warning appears whenever you make an error in the same opening position at least twice across your analyzed games.</p>
      </div>`;
    return puzzles;
  }

  el.innerHTML = `
    <div class="trap-list">
      ${puzzles.map((p, i) => `
        <div class="trap-card">
          <div class="trap-header">
            <span class="trap-badge">⚠️ ${p.t.n} Mistakes Recorded</span>
            <span class="trap-losses">${p.t.losses} ${p.t.losses === 1 ? 'game lost' : 'games lost'}</span>
            <span class="side-tag ${p.color === 'w' ? 'tag-white' : 'tag-black'}">As ${p.color === 'w' ? 'White' : 'Black'}</span>
          </div>
          <div class="trap-body">
            <div class="trap-detail">
              <span class="lbl">You played:</span>
              <span class="badge blunder">${p.played}</span>
            </div>
            <div class="trap-detail">
              <span class="lbl">Opponent punished with:</span>
              <span class="badge punishment">${top(p.t.punish) || 'various'}</span>
            </div>
            <div class="trap-detail">
              <span class="lbl">Engine solution:</span>
              <span class="badge best">${p.bestSan}</span>
            </div>
          </div>
          <div class="trap-actions">
            <button class="btn btn-primary" data-drill="${i}">⚔️ Drill this position</button>
          </div>
        </div>
      `).join('')}
    </div>`;

  return puzzles;
}
