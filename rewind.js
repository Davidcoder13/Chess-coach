// Blunder Rewind: puzzles from your own mistakes/blunders.
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0/+esm';
import { makeBoard, COLOR, INPUT_EVENT_TYPE } from './board.js';

export function buildPuzzles(games) {
  const out = [];
  for (const g of games) {
    const pl = g.analysis?.plies; if (!pl?.length) continue;
    let mv; try { const c = new Chess(); c.loadPgn(g.pgn); mv = c.history({ verbose: true }); } catch { continue; }
    mv.forEach((m, i) => {
      const p = pl[i];
      if (!p || m.color !== g.color || i < 6 || !['mistake', 'blunder'].includes(p.grade)) return;
      const prev = i ? pl[i - 1].cp : 0, before = g.color === 'w' ? prev : -prev;
      if (before < -300) return; // already lost: not a fair puzzle
      out.push({ id: g.url + '#' + i, fen: m.before, color: g.color, best: p.best, played: m.san, loss: Math.round(p.loss), end_time: g.end_time });
    });
  }
  return out;
}

let board;
export async function startRewind(db, games, $, onChange, custom) {
  const done = new Map((await db.rewind.toArray()).map(r => [r.id, r]));
  const set = custom ? [custom] : buildPuzzles(games).filter(p => !done.get(p.id)?.solved).sort((a, b) => b.end_time - a.end_time).slice(0, 5);
  let idx = 0, solved = 0;
  const msg = t => $('rwmsg').textContent = t, fb = (t, cls = '') => { $('rwfb').textContent = t; $('rwfb').className = cls; };
  const record = async (p, ok, tries) => { await db.rewind.put({ id: p.id, solved: ok, tries, last: Date.now() }); onChange?.(); };

  function show() {
    if (idx >= set.length) { $('rwboard').innerHTML = ''; msg(set.length ? `Done for today: ${solved} of ${set.length} solved.` : 'No puzzles yet. They appear once games are analyzed and contain mistakes.'); fb(''); return; }
    const p = set[idx]; let tries = 0, over = false;
    msg(`Puzzle ${idx + 1} of ${set.length}: you're ${p.color === 'w' ? 'White' : 'Black'}. Find the move you missed.`); fb('');
    board = makeBoard($('rwboard'), p.fen, p.color);
    board.enableMoveInput(e => {
      if (e.type === INPUT_EVENT_TYPE.moveInputStarted) return !over;
      if (e.type !== INPUT_EVENT_TYPE.validateMoveInput) return true;
      if (e.squareFrom + e.squareTo !== p.best.slice(0, 4)) {
        tries++; fb(`Not the best move. Try again (${tries} ${tries === 1 ? 'try' : 'tries'}).`, 'loss');
        return false;
      }
      over = true; solved++; board.disableMoveInput();
      fb(p.note ? `Found it. ${p.note}` : `Found it. In the game you played ${p.played}, which cost about ${p.loss}% win chance.`, 'win');
      record(p, true, tries + 1); return true;
    }, p.color === 'w' ? COLOR.white : COLOR.black);
    $('rwhint').onclick = () => {
      if (over) return; over = true; board.disableMoveInput();
      const m = new Chess(p.fen).move({ from: p.best.slice(0, 2), to: p.best.slice(2, 4), promotion: p.best[4] });
      fb(`The best move was ${m.san}.${p.note ? '' : ' It stays in your queue for another try.'}`, 'mute'); record(p, false, tries + 1);
    };
    $('rwnext').onclick = () => { idx++; show(); };
  }
  show();
}
