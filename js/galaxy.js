// Opening Galaxy: your first moves as a glowing force graph.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0/+esm';

export function buildTree(games, color, maxPly = 10) {
  const nodes = new Map([['', { id: '', ply: 0, n: 0, sc: 0, mv: 0, bad: 0 }]]), links = [];
  for (const g of games.filter(x => x.color === color)) {
    let mv; try { const c = new Chess(); c.loadPgn(g.pgn); mv = c.history(); } catch { continue; }
    const sc = g.result === 'win' ? 1 : g.result === 'draw' ? .5 : 0; let key = '';
    nodes.get('').n++; nodes.get('').sc += sc;
    mv.slice(0, maxPly).forEach((san, i) => {
      const parent = key; key += (key ? ' ' : '') + san;
      let nd = nodes.get(key);
      if (!nd) { nd = { id: key, ply: i + 1, n: 0, sc: 0, mv: 0, bad: 0 }; nodes.set(key, nd); links.push({ source: parent, target: key }); }
      nd.n++; nd.sc += sc;
      const p = g.analysis?.plies?.[i];
      if ((i % 2 === 0) === (color === 'w') && p) { nd.mv++; if (p.loss >= 10) nd.bad++; }
    });
  }
  return { nodes: [...nodes.values()], links };
}

const pretty = id => id ? id.split(' ').map((m, i) => i % 2 ? m : `${i / 2 + 1}. ${m}`).join(' ') : 'Start';

export function drawGalaxy(el, games, color) {
  const t = buildTree(games, color);
  const keep = new Set(t.nodes.filter(n => n.id === '' || n.n >= (n.ply <= 4 ? 1 : 2)).map(n => n.id));
  const N = t.nodes.filter(n => keep.has(n.id)), L = t.links.filter(l => keep.has(l.source) && keep.has(l.target));
  el.innerHTML = '';
  if (N.length < 2) { el.innerHTML = '<p class="mute">No games as this colour yet.</p>'; return; }
  const W = el.clientWidth || 800, H = 560, rad = n => n.id === '' ? 8 : Math.min(22, 3 + 3 * Math.sqrt(n.n));
  const col = n => n.n < 3 ? '#555b66' : ((n.mv && n.bad / n.mv >= .2) || n.sc / n.n < .4) ? '#f0883e' : '#4cc35a';
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).style('width', '100%').style('background', '#0e0f13').style('border-radius', '4px');
  svg.append('defs').html('<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>');
  N[0].fx = W / 2; N[0].fy = H / 2;
  const link = svg.append('g').attr('stroke', '#2a2f3a').selectAll('line').data(L).join('line');
  const node = svg.append('g').selectAll('circle').data(N).join('circle').attr('r', rad).attr('fill', col)
    .attr('filter', n => n.n >= 3 ? 'url(#glow)' : null);
  node.append('title').text(n => `${pretty(n.id)}\n${n.n} games, ${Math.round(n.sc / (n.n || 1) * 100)}% score` + (n.mv ? `\n${Math.round(n.bad / n.mv * 100)}% of your moves here were mistakes` : ''));
  d3.forceSimulation(N).force('link', d3.forceLink(L).id(d => d.id).distance(38).strength(.9))
    .force('charge', d3.forceManyBody().strength(-70)).force('collide', d3.forceCollide(d => rad(d) + 2))
    .on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('cx', d => d.x).attr('cy', d => d.y);
    });
}
