// Plan page: top weaknesses, weekly checklist, daily routine. Built from analyzed games only.
import { findTraps } from './traps.js';
export function renderPlan(games, rewindRows) {
  const mine = games.filter(g => g.analysis?.plies?.length);
  if (!mine.length) return '<p class="mute">Your plan appears once your first game has been analyzed.</p>';
  const b = { opening: [0, 0], middlegame: [0, 0], endgame: [0, 0], white: [0, 0], black: [0, 0] };
  for (const g of mine) g.analysis.plies.forEach((p, i) => {
    if (p.color !== g.color) return;
    const err = p.loss >= 10 ? 1 : 0, ph = i < 20 ? 'opening' : i < 60 ? 'middlegame' : 'endgame', side = g.color === 'w' ? 'white' : 'black';
    for (const k of [ph, side]) { b[k][0]++; b[k][1] += err; }
  });
  const label = { opening: 'The opening (first 10 moves)', middlegame: 'The middlegame', endgame: 'The endgame (after move 30)', white: 'Playing White', black: 'Playing Black' };
  const weak = Object.entries(b).filter(([, v]) => v[0] >= 30).map(([k, v]) => [k, v[1] / v[0] * 100])
    .sort((x, y) => y[1] - x[1]).slice(0, 3);
  const wk = Date.now() - 7 * 864e5, played = games.filter(g => g.end_time * 1000 > wk).length;
  const solved = rewindRows.filter(r => r.solved && r.last > wk).length;
  const reviewed = new Set(JSON.parse(localStorage.reviews || '[]').filter(r => r.t > wk).map(r => r.u)).size;
  const item = (txt, n, goal) => `<li>${n >= goal ? '☑' : '☐'} ${txt} <span class="mute">(${Math.min(n, goal)}/${goal})</span></li>`;
  const latest = [...games].sort((a, c) => c.end_time - a.end_time)[0];
  const trap = findTraps(mine)[0];
  const warn = trap ? `<p class="warn"><b>⚠ Trap warning:</b> you've gone wrong ${trap.n} times in the same opening position. <button data-v="traps">See it</button></p>` : '';
  return `${warn}<h3>Your top weaknesses</h3>
    <ol>${weak.map(([k, r]) => `<li><b>${label[k]}</b>: ${r.toFixed(1)} mistakes or blunders per 100 moves</li>`).join('') || '<li class="mute">Not enough analyzed moves yet.</li>'}</ol>
    ${mine.length < 20 ? `<p class="mute">Based on ${mine.length} analyzed games so far. This sharpens as the queue runs.</p>` : ''}
    <h3>This week</h3><ul style="list-style:none;padding:0">${item('Play 5 games', played, 5)}${item('Solve 10 Rewind puzzles', solved, 10)}${item('Review 3 of your games', reviewed, 3)}</ul>
    <h3>Today</h3><p><button class="go" data-v="rewind">Blunder Rewind: 5 puzzles</button>
    <button data-open="${latest.url}">Review your latest game</button></p>`;
}
