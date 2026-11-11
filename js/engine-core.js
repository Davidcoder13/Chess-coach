export const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);

export const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const moveAcc = loss => clamp(103.1668 * Math.exp(-0.04354 * loss) - 3.1669, 0, 100);

export const mat = (fen, c) => {
  let s = 0;
  for (const ch of fen.split(' ')[0]) {
    const v = VAL[ch.toLowerCase()];
    if (v) s += ch === ch.toUpperCase() ? v : -v;
  }
  return c === 'w' ? s : -s;
};

export function grade(loss, isBest) {
  return loss < 2 ? (isBest ? 'best' : 'excellent') : loss < 5 ? 'good' : loss < 10 ? 'inaccuracy' : loss < 20 ? 'mistake' : 'blunder';
}

export function accuracyOf(plies) {
  const wp = [50, ...plies.map(p => winPct(p.cp))];
  const win = clamp(Math.floor(plies.length / 10), 2, 8);
  const out = {};
  const sd = a => {
    const m = a.reduce((s, x) => s + x, 0) / a.length;
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
  };

  for (const c of ['w', 'b']) {
    const xs = [];
    const ws = [];
    plies.forEach((p, i) => {
      if (p.color !== c) return;
      xs.push(moveAcc(p.loss));
      ws.push(clamp(sd(wp.slice(i, i + win)), .5, 12));
    });

    if (!xs.length) {
      out[c] = null;
      continue;
    }

    const weightedMean = xs.reduce((s, x, k) => s + x * ws[k], 0) / ws.reduce((s, x) => s + x, 0);
    out[c] = (weightedMean + xs.length / xs.reduce((s, x) => s + 1 / Math.max(x, 1), 0)) / 2;
  }

  return out;
}
