// Stockfish worker wrapper, move grading, and the background analysis queue.
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0/+esm';

let worker, ready;
export async function initEngine() {
  if (ready) return ready;
  ready = (async () => {
    let file = 'stockfish-18-lite-single.js'; // default; vendor/engine.json can override
    try { file = (await (await fetch('vendor/engine.json')).json()).file || file; } catch {}
    worker = new Worker('vendor/' + file);
    await send('uci', l => l === 'uciok');
    await send('isready', l => l === 'readyok');
  })();
  return ready;
}
function send(cmd, done) {
  return new Promise(res => {
    const out = [];
    const on = e => { const l = String(e.data); out.push(l); if (done(l)) { worker.removeEventListener('message', on); res(out); } };
    worker.addEventListener('message', on);
    worker.postMessage(cmd);
  });
}
// Returns { cp (white POV, mates ±10000), best (uci) }
export async function evalFen(fen, depth) {
  worker.postMessage('position fen ' + fen);
  const lines = await send('go depth ' + depth, l => l.startsWith('bestmove'));
  let cp = 0;
  for (const l of lines) {
    const m = l.match(/score (cp|mate) (-?\d+)/);
    if (m) cp = m[1] === 'cp' ? +m[2] : (+m[2] > 0 ? 10000 : -10000) ;
  }
  if (fen.split(' ')[1] === 'b') cp = -cp;
  return { cp, best: lines.at(-1).split(' ')[1] };
}

const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const mat = (fen, c) => { let s = 0; for (const ch of fen.split(' ')[0]) { const v = VAL[ch.toLowerCase()]; if (v) s += ch === ch.toUpperCase() ? v : -v; } return c === 'w' ? s : -s; };
export function grade(loss, isBest) {
  return loss < 2 ? (isBest ? 'best' : 'excellent') : loss < 5 ? 'good' : loss < 10 ? 'inaccuracy' : loss < 20 ? 'mistake' : 'blunder';
}
// Brilliant: a (near-)best move that gives up material (net of the engine's best reply), from a position that
// isn't already clearly winning, and that doesn't leave you worse. beforeW/afterW are the mover's win%.
function isBrilliant(m, reply, loss, beforeW, afterW) {
  if (loss > 1 || beforeW > 80 || afterW < 45 || m.san.includes('#')) return false;
  try {
    const c = new Chess(m.after); c.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
    return mat(m.before, m.color) - mat(c.fen(), m.color) >= 2;
  } catch { return false; }
}

export async function analyzeGame(game, depth) {
  const chess = new Chess();
  chess.loadPgn(game.pgn);
  const moves = chess.history({ verbose: true });
  const fens = [moves[0]?.before ?? new Chess().fen(), ...moves.map(m => m.after)];
  const evals = [];
  for (const f of fens) evals.push(await evalFen(f, depth));
  const plies = moves.map((m, i) => {
    const white = m.color === 'w', bW = winPct(evals[i].cp), aW = winPct(evals[i + 1].cp);
    const loss = Math.max(0, white ? bW - aW : aW - bW);
    let g = grade(loss, m.from + m.to + (m.promotion || '') === evals[i].best);
    if ((g === 'best' || g === 'excellent') && isBrilliant(m, evals[i + 1].best, loss, white ? bW : 100 - bW, white ? aW : 100 - aW)) g = 'brilliant';
    return { san: m.san, color: m.color, cp: evals[i + 1].cp, best: evals[i].best, loss, grade: g };
  });
  const acc = c => {
    const l = plies.filter(p => p.color === c);
    return l.length ? l.reduce((s, p) => s + Math.max(0, 103.1668 * Math.exp(-0.04354 * p.loss) - 3.1669), 0) / l.length : null;
  };
  return { v: 2, depth, plies, accuracy: { w: acc('w'), b: acc('b') } };
}

// Newest game gets full depth first, then the rest run newest -> oldest at a lighter depth.
export async function runQueue(games, save, onProgress, { full = 18, light = 12 } = {}) {
  await initEngine();
  const todo = games.filter(g => !g.analysis || (g.analysis.v !== 2 && !g.analysis.error)).sort((a, b) => b.end_time - a.end_time);
  const total = games.length; let done = total - todo.length;
  onProgress(done, total);
  for (const [i, g] of todo.entries()) {
    while (document.hidden) await new Promise(r => setTimeout(r, 1000));
    try { g.analysis = await analyzeGame(g, i === 0 ? full : light); await save(g); }
    catch (e) { console.warn('skip', g.url, e); g.analysis = { error: true, plies: [] }; await save(g); }
    onProgress(++done, total);
  }
}
