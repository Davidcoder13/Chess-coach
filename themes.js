// Tactic detection for the review overlay: absolute pins, forks, hanging pieces.
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0/+esm';
const V = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const F = 'abcdefgh', sq = (f, r) => F[f] + (r + 1), cap = s => s[0].toUpperCase() + s.slice(1);

export function detect(fen) {
  const c = new Chess(fen), out = [], pieces = c.board().flat().filter(Boolean);
  // Pins to the king
  for (const k of pieces.filter(p => p.type === 'k')) {
    for (const [df, dr] of DIRS) {
      let f = F.indexOf(k.square[0]) + df, r = +k.square[1] - 1 + dr, mid = null;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const p = c.get(sq(f, r));
        if (p) {
          if (!mid) { if (p.color !== k.color) break; mid = { p, s: sq(f, r) }; }
          else {
            if (p.color !== k.color && (p.type === 'q' || p.type === (df && dr ? 'b' : 'r')))
              out.push({ from: sq(f, r), to: mid.s, at: mid.s, icon: '📌', text: `${cap(NAME[mid.p.type])} on ${mid.s} is pinned to its king by the ${NAME[p.type]} on ${sq(f, r)}.` });
            break;
          }
        }
        f += df; r += dr;
      }
    }
  }
  // Attack/defence maps
  const atk = {}, def = {};
  for (const t of pieces) { const e = t.color === 'w' ? 'b' : 'w'; atk[t.square] = c.attackers(t.square, e); def[t.square] = c.attackers(t.square, t.color).length; }
  // Forks
  for (const a of pieces) {
    if (a.type === 'k') continue;
    const targets = pieces.filter(t => t.color !== a.color && t.type !== 'p' && atk[t.square].includes(a.square) && (V[t.type] > V[a.type] || !def[t.square]));
    if (targets.length >= 2)
      out.push({ from: a.square, to: targets.map(t => t.square), at: a.square, icon: '🍴', text: `${cap(NAME[a.type])} on ${a.square} forks the ${targets.map(t => `${NAME[t.type]} on ${t.square}`).join(' and ')}.` });
  }
  // Hanging pieces
  for (const t of pieces)
    if (t.type !== 'k' && t.type !== 'p' && atk[t.square].length && !def[t.square])
      out.push({ from: t.square, to: t.square, at: t.square, icon: '⚠️', text: `${cap(NAME[t.type])} on ${t.square} is attacked and undefended.` });
  return out.slice(0, 5);
}
