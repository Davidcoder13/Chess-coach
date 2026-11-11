// Blunder Rewind: puzzles from your own mistakes/blunders with rich interactive feedback.
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0/+esm';
import { makeBoard, COLOR, INPUT_EVENT_TYPE } from './board.js';
import { playMove, playSuccess, playError } from './sound.js';

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
  const history = [];

  const msg = t => $('rwmsg').innerHTML = t;
  const fb = (t, cls = '') => {
    const el = $('rwfb');
    if (!el) return;
    el.innerHTML = t;
    el.className = 'puzzle-feedback ' + cls;
  };
  const record = async (p, ok, tries) => {
    history[idx] = ok ? 'solved' : 'failed';
    await db.rewind.put({ id: p.id, solved: ok, tries, last: Date.now() });
    onChange?.();
    renderStepper();
  };

  function renderStepper() {
    const stepEl = $('rwstepper');
    if (!stepEl) return;
    if (!set.length) { stepEl.innerHTML = ''; return; }
    stepEl.innerHTML = set.map((_, i) => {
      const st = history[i];
      const cls = st === 'solved' ? 'step-done' : st === 'failed' ? 'step-failed' : i === idx ? 'step-cur' : '';
      const icon = st === 'solved' ? '✓' : st === 'failed' ? '✗' : i + 1;
      return `<span class="step-pill ${cls}" title="Puzzle ${i + 1}">${icon}</span>`;
    }).join('');
  }

  function show() {
    renderStepper();
    if (idx >= set.length) {
      $('rwboard').innerHTML = '';
      $('rwhint').style.display = 'none';
      $('rwnext').style.display = 'none';
      msg(set.length ? `<div class="puzzle-complete"><h3>Session Complete! 🎉</h3><p>You solved <b>${solved} of ${set.length}</b> puzzles from your past games.</p></div>` : '<div class="empty-state">No blunders found to drill yet. They will appear as more games are analyzed!</div>');
      fb('');
      return;
    }
    const p = set[idx];
    let tries = 0, over = false;
    $('rwhint').style.display = 'inline-flex';
    $('rwnext').style.display = 'inline-flex';
    $('rwhint').disabled = false;
    $('rwnext').textContent = idx === set.length - 1 ? 'Finish Session' : 'Next Puzzle ➔';

    const sideName = p.color === 'w' ? 'White' : 'Black';
    msg(`<div class="puzzle-banner"><span class="turn-indicator ${p.color === 'w' ? 'turn-white' : 'turn-black'}"></span> <b>${sideName} to move</b> — Find the move you missed!</div>`);
    fb('');

    board = makeBoard($('rwboard'), p.fen, p.color);
    board.enableMoveInput(e => {
      if (e.type === INPUT_EVENT_TYPE.moveInputStarted) return !over;
      if (e.type !== INPUT_EVENT_TYPE.validateMoveInput) return true;
      if (e.squareFrom + e.squareTo !== p.best.slice(0, 4)) {
        tries++;
        playError();
        fb(`<b>Not quite.</b> Try again (${tries} ${tries === 1 ? 'attempt' : 'attempts'}).`, 'loss');
        return false;
      }
      over = true;
      solved++;
      playSuccess();
      board.disableMoveInput();
      $('rwhint').disabled = true;
      fb(p.note ? `<b>Found it!</b> ${p.note}` : `<b>Found it! ⭐</b> In your game you played <span class="badge blunder">${p.played}</span>, losing ~${p.loss}% win equity.`, 'win');
      record(p, true, tries + 1);
      return true;
    }, p.color === 'w' ? COLOR.white : COLOR.black);

    $('rwhint').onclick = () => {
      if (over) return;
      over = true;
      playMove();
      board.disableMoveInput();
      $('rwhint').disabled = true;
      let mSan = p.best;
      try {
        const m = new Chess(p.fen).move({ from: p.best.slice(0, 2), to: p.best.slice(2, 4), promotion: p.best[4] });
        mSan = m.san;
      } catch {}
      fb(`The best move was <span class="badge best">${mSan}</span>.${p.note ? '' : ' It remains in your review queue.'}`, 'hint');
      record(p, false, tries + 1);
    };

    $('rwnext').onclick = () => {
      idx++;
      show();
    };
  }

  show();
}
