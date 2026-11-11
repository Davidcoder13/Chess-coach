// Coach: plain-English explanations built from engine data plus facts we can verify on the board.
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0/+esm';
import { detect } from './themes.js';

const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const V = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
const fmt = cp => Math.abs(cp) >= 9000 ? (cp > 0 ? '+#' : '-#') : (cp >= 0 ? '+' : '') + (cp / 100).toFixed(1);
const sanOf = (fen, uci) => {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return uci;
  }
};

const GRADE_ICONS = {
  brilliant: '💎',
  best: '⭐',
  excellent: '👍',
  good: '✓',
  inaccuracy: '⚠️',
  mistake: '❓',
  blunder: '❌'
};

export function explainPly(o) {
  const { fenBefore, fenAfter, move: m, ply: p, prevCp, next, clk, userColor, idx } = o;
  const you = m.color === userColor, own = you ? 'Your' : 'Their', sub = you ? 'You' : 'They';
  const sgn = m.color === 'w' ? 1 : -1, enemy = m.color === 'w' ? 'b' : 'w';
  const b = prevCp * sgn, a = p.cp * sgn, bestSan = sanOf(fenBefore, p.best);
  if (p.grade === 'brilliant') return `Brilliant: ${p.san} gives up material, but engine calculations confirm ${you ? 'your' : 'their'} position remains winning.`;

  const head = `${you ? '' : 'Opponent: '}${p.san} was ${/^[aeiou]/.test(p.grade) ? 'an' : 'a'} ${p.grade} (${fmt(b)} → ${fmt(a)}).`;
  const why = [], after = new Chess(fenAfter);
  if (b >= 9000) why.push(`${sub} had a forced mate available with ${bestSan}.`);
  else if (a <= -9000) why.push('This allowed a forced checkmate sequence.');

  for (const s of after.board().flat().filter(x => x && x.color === m.color && x.type !== 'k' && x.type !== 'p')) {
    const att = after.attackers(s.square, enemy); if (!att.length) continue;
    if (!after.attackers(s.square, m.color).length) { why.push(`${own} ${NAME[s.type]} on ${s.square} was left undefended and under attack.`); break; }
    if (s.square === m.to && Math.min(...att.map(q => V[after.get(q).type])) < V[s.type]) { why.push(`${own} ${NAME[s.type]} on ${m.to} can be captured by a lower-value piece.`); break; }
  }
  const seen = new Set(detect(fenBefore).map(t => t.text));
  for (const t of detect(fenAfter)) {
    if (seen.has(t.text)) continue; const pc = after.get(t.at);
    if (t.icon === '🍴' && pc?.color === enemy) { why.push(`It allowed an enemy fork: ${t.text}`); break; }
    if (t.icon === '📌' && pc?.color === m.color) { why.push(`It walked into a pin: ${t.text}`); break; }
  }
  try {
    const bc = new Chess(fenBefore), bm = bc.move({ from: p.best.slice(0, 2), to: p.best.slice(2, 4), promotion: p.best[4] });
    if (bm.captured && !m.captured) why.push(`${sub} missed a capture: ${bestSan} (taking a ${NAME[bm.captured]}).`);
    else { const fk = detect(bc.fen()).find(t => t.icon === '🍴' && bc.get(t.at)?.color === m.color && !seen.has(t.text));
      if (fk) why.push(`${bestSan} would have set up a tactical fork: ${fk.text}`); }
  } catch {}
  if (m.captured && next?.captured && next.to === m.to && b >= 100 && p.loss >= 10) why.push(`The piece trade on ${m.to} released pressure and squandered ${own.toLowerCase()} edge.`);
  if (clk != null && clk <= 20) why.push(`${sub} were in time trouble with only ${Math.round(clk)} seconds remaining.`);
  if (!why.length && idx <= 12) why.push('An inaccurate opening deviation.');
  if (!why.length) why.push(`The engine preferred ${bestSan}.`);
  const out = why.slice(0, 3); if (!out.some(s => s.includes(bestSan))) out.push(`Better was ${bestSan}.`);
  return [head, ...out].join(' ');
}

export function formatCoachCard(o) {
  const { fenBefore, move: m, ply: p, prevCp, userColor } = o;
  const you = m.color === userColor;
  const sgn = m.color === 'w' ? 1 : -1;
  const b = prevCp * sgn;
  const a = p.cp * sgn;
  const bestSan = sanOf(fenBefore, p.best);
  const icon = GRADE_ICONS[p.grade] || '💬';
  const explanation = explainPly(o);

  return `
    <div class="coach-speech ${p.grade}">
      <div class="coach-avatar">${icon}</div>
      <div class="coach-content">
        <div class="coach-header">
          <span class="badge ${p.grade}">${p.grade.toUpperCase()}</span>
          <span class="coach-side">${you ? 'Your Move' : 'Opponent Move'}: <b>${p.san}</b></span>
          <span class="coach-eval">${fmt(b)} ➔ ${fmt(a)}</span>
        </div>
        <div class="coach-text">${explanation}</div>
        ${p.grade !== 'best' && p.grade !== 'brilliant' && bestSan ? `
          <div class="coach-suggestion">
            <span class="lbl">Better move:</span>
            <span class="badge best">${bestSan}</span>
          </div>` : ''}
      </div>
    </div>`;
}

// One-paragraph game story: when you were ahead, where it turned, and why.
export function summarize(g, pl, explainAt) {
  if (!pl?.length) return '';
  const u = g.color, sgn = u === 'w' ? 1 : -1, mn = i => Math.floor(i / 2) + 1;
  const wp = i => winPct(sgn * pl[i].cp), mine = pl.map((p, i) => [p, i]).filter(([p]) => p.color === u);
  const adv = pl.findIndex((_, i) => i >= 5 && wp(i) >= 65);
  const parts = [], drop = adv >= 0 && mine.find(([p, i]) => i > adv && p.loss >= 10);
  if (drop) parts.push(`You were ahead until move ${mn(drop[1])}. ${explainAt(drop[1])}`);
  else if (adv >= 0) parts.push(`You built an advantage around move ${mn(adv)} and held onto it decisively.`);
  else {
    parts.push('You were under pressure for most of this game.');
    const worst = mine.reduce((x, y) => (!x || y[0].loss > x[0].loss) ? y : x, null);
    if (worst && worst[0].loss >= 10) parts.push(`Key turning point at move ${mn(worst[1])}: ${explainAt(worst[1])}`);
  }
  const n = k => mine.filter(([p]) => p.grade === k).length;
  parts.push(`Summary: ${n('brilliant')} brilliant, ${n('blunder')} blunders, ${n('mistake')} mistakes, ${n('inaccuracy')} inaccuracies.`);
  return parts.join(' ');
}
