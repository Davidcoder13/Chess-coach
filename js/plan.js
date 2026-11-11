// Plan page: top weaknesses, weekly checklist, daily routine. Built from analyzed games only.
import { findTraps } from './traps.js';

export function renderPlan(games, rewindRows) {
  const mine = games.filter(g => g.analysis?.plies?.length);
  if (!mine.length) {
    return `
      <div class="empty-state">
        <div class="empty-icon">🎯</div>
        <h3>Your Training Plan is Generating...</h3>
        <p>Your personalized chess plan will automatically appear as soon as your first game finishes Stockfish analysis.</p>
      </div>`;
  }

  const b = { opening: [0, 0], middlegame: [0, 0], endgame: [0, 0], white: [0, 0], black: [0, 0] };
  for (const g of mine) {
    g.analysis.plies.forEach((p, i) => {
      if (p.color !== g.color) return;
      const err = p.loss >= 10 ? 1 : 0;
      const ph = i < 20 ? 'opening' : i < 60 ? 'middlegame' : 'endgame';
      const side = g.color === 'w' ? 'white' : 'black';
      for (const k of [ph, side]) { b[k][0]++; b[k][1] += err; }
    });
  }

  const label = {
    opening: 'Opening Phase (first 10 moves)',
    middlegame: 'Middlegame Complex',
    endgame: 'Endgame Precision (move 30+)',
    white: 'Playing with White',
    black: 'Playing with Black'
  };

  const weak = Object.entries(b)
    .filter(([, v]) => v[0] >= 15)
    .map(([k, v]) => ({ key: k, label: label[k], rate: (v[1] / v[0]) * 100, moves: v[0], errors: v[1] }))
    .sort((x, y) => y.rate - x.rate)
    .slice(0, 3);

  const wk = Date.now() - 7 * 864e5;
  const played = games.filter(g => g.end_time * 1000 > wk).length;
  const solved = rewindRows.filter(r => r.solved && r.last > wk).length;
  const reviewed = new Set(JSON.parse(localStorage.reviews || '[]').filter(r => r.t > wk).map(r => r.u)).size;

  const latest = [...games].sort((a, c) => c.end_time - a.end_time)[0];
  const trap = findTraps(mine)[0];

  const goalCard = (title, count, target, icon) => {
    const pct = Math.min(100, Math.round((count / target) * 100));
    const done = count >= target;
    return `
      <div class="goal-item ${done ? 'goal-done' : ''}">
        <div class="goal-icon">${icon}</div>
        <div class="goal-info">
          <div class="goal-header">
            <span class="goal-title">${title}</span>
            <span class="goal-count">${count}/${target} ${done ? '✓' : ''}</span>
          </div>
          <div class="goal-track"><div class="goal-fill" style="width:${pct}%"></div></div>
        </div>
      </div>`;
  };

  const trapBanner = trap ? `
    <div class="alert-banner warning">
      <div class="alert-icon">⚠️</div>
      <div class="alert-content">
        <b>Trap alert:</b> You've blundered <b>${trap.n} times</b> in the same opening position!
      </div>
      <button class="btn btn-outline-warning" data-v="traps">Review Traps ➔</button>
    </div>` : '';

  return `
    <div class="plan-dashboard">
      ${trapBanner}

      <div class="plan-grid">
        <section class="card weakness-card">
          <div class="card-title">
            <span class="card-icon">🎯</span>
            <h3>Top Focus Areas</h3>
            <span class="badge badge-info">${mine.length} games analyzed</span>
          </div>
          <div class="weakness-list">
            ${weak.length ? weak.map(w => `
              <div class="weakness-item">
                <div class="weakness-head">
                  <span class="weakness-name">${w.label}</span>
                  <span class="weakness-rate">${w.rate.toFixed(1)} blunders / 100 moves</span>
                </div>
                <div class="bar-track">
                  <div class="bar-fill" style="width: ${Math.min(100, w.rate * 2.5)}%; background: ${w.rate > 20 ? 'var(--red)' : w.rate > 10 ? 'var(--orange)' : 'var(--yellow)'}"></div>
                </div>
              </div>
            `).join('') : '<p class="mute">Analysis running. More data needed to identify statistical weaknesses.</p>'}
          </div>
        </section>

        <section class="card checklist-card">
          <div class="card-title">
            <span class="card-icon">📅</span>
            <h3>Weekly Training Checklist</h3>
          </div>
          <div class="goals-container">
            ${goalCard('Play 5 rated games', played, 5, '♟️')}
            ${goalCard('Solve 10 Blunder Rewind puzzles', solved, 10, '🧩')}
            ${goalCard('Review 3 games with Coach', reviewed, 3, '🔍')}
          </div>
        </section>
      </div>

      <section class="card today-hero">
        <div class="today-content">
          <div>
            <span class="badge-pill">Daily Routine</span>
            <h2>Today's Workout</h2>
            <p class="mute">Consistent tactical puzzle drills and deep game review are proven to raise rating faster than blitz spam.</p>
          </div>
          <div class="today-actions">
            <button class="btn btn-primary btn-lg" data-v="rewind">
              <span>🧩</span> Solve 5 Blunder Puzzles
            </button>
            ${latest ? `
              <button class="btn btn-secondary btn-lg" data-open="${latest.url}">
                <span>🔍</span> Review Latest vs ${latest.opponent}
              </button>` : ''}
            <button class="btn btn-ghost btn-lg" data-v="galaxy">
              <span>🌌</span> Explore Opening Galaxy
            </button>
          </div>
        </div>
      </section>
    </div>`;
}
