// Opening Galaxy: your first moves as an interactive glowing force graph, with opening names and unexplored lines.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0/+esm';
import { norm, classify } from './book.js';

export function buildTree(games, color, book = new Map(), maxPly = 10) {
  const root = { id: '', ply: 0, n: 0, sc: 0, mv: 0, bad: 0, name: '', eco: '' };
  const nodes = new Map([['', root]]), links = [];
  for (const g of games.filter(x => x.color === color)) {
    let mv; try { const c = new Chess(); c.loadPgn(g.pgn); mv = c.history(); } catch { continue; }
    const sc = g.result === 'win' ? 1 : g.result === 'draw' ? .5 : 0; let key = '', nk = '', nm = '', eco = '';
    root.n++; root.sc += sc;
    mv.slice(0, maxPly).forEach((san, i) => {
      const parent = key; key += (key ? ' ' : '') + san; nk += (nk ? ' ' : '') + norm(san);
      const e = book?.get ? book.get(nk) : null; if (e) { nm = e.name; eco = e.eco; }
      let nd = nodes.get(key);
      if (!nd) { nd = { id: key, ply: i + 1, n: 0, sc: 0, mv: 0, bad: 0, name: nm, eco }; nodes.set(key, nd); links.push({ source: parent, target: key }); }
      nd.n++; nd.sc += sc;
      const p = g.analysis?.plies?.[i];
      if ((i % 2 === 0) === (color === 'w') && p) { nd.mv++; if (p.loss >= 10) nd.bad++; }
    });
  }
  return { nodes: [...nodes.values()], links };
}

// Named book lines one move beyond a position you reach often, which you never played.
function addGhosts(N, L, book) {
  const at = new Map(N.map(n => [norm(n.id), n])), by = new Map();
  for (const [s, e] of book) {
    if (e.ply > 10) continue;
    const i = s.lastIndexOf(' '), p = i < 0 ? '' : s.slice(0, i), par = at.get(p);
    if (!par || par.n < 3 || at.has(s)) continue;
    if (!by.has(p)) by.set(p, []); by.get(p).push([s, e]);
  }
  for (const [p, list] of by) for (const [s, e] of list.sort((a, b) => a[1].name.length - b[1].name.length).slice(0, 5)) {
    const g = { id: 'ghost:' + s, ghost: true, ply: e.ply, n: 0, sc: 0, mv: 0, bad: 0, name: e.name, eco: e.eco };
    N.push(g); L.push({ source: at.get(p).id, target: g.id });
  }
}

const pretty = id => id ? id.split(' ').map((m, i) => i % 2 ? m : `${i / 2 + 1}. ${m}`).join(' ') : 'Starting Position';

export function drawGalaxy(el, games, color, book = new Map(), ghosts = true) {
  const t = buildTree(games, color, book);
  const keep = new Set(t.nodes.filter(n => n.id === '' || n.n >= (n.ply <= 4 ? 1 : 2)).map(n => n.id));
  const N = t.nodes.filter(n => keep.has(n.id)), L = t.links.filter(l => keep.has(l.source) && keep.has(l.target));
  el.innerHTML = '';
  if (N.length < 2) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🌌</div>
        <h3>No games recorded as ${color === 'w' ? 'White' : 'Black'} yet</h3>
        <p>Import games or fetch from Chess.com to generate your opening constellation.</p>
      </div>`;
    return;
  }
  if (ghosts && book.size) addGhosts(N, L, book);
  const byId = new Map(N.map(n => [n.id, n])), par = new Map(L.map(l => [l.target, l.source]));
  const lab = N.filter(n => !n.ghost && n.id && n.name && n.n >= 4 && byId.get(par.get(n.id))?.name !== n.name);
  const W = el.clientWidth || 860, H = 580;
  const rad = n => n.id === '' ? 10 : n.ghost ? 4.5 : Math.min(24, 4 + 3.2 * Math.sqrt(n.n));
  const col = n => n.ghost ? '#161922' : n.n < 3 ? '#64748b' : ((n.mv && n.bad / n.mv >= .2) || n.sc / n.n < .4) ? '#f97316' : '#10b981';

  const svg = d3.select(el).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .style('width', '100%')
    .style('height', '580px')
    .style('background', 'radial-gradient(ellipse at center, #121622 0%, #090a0f 100%)')
    .style('border-radius', '12px')
    .style('box-shadow', 'inset 0 0 40px rgba(0,0,0,0.6)');

  // Definitions for glow filters
  const defs = svg.append('defs');
  defs.html(`
    <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow-orange" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  `);

  const container = svg.append('g').attr('class', 'galaxy-container');

  // Zoom support
  const zoom = d3.zoom()
    .scaleExtent([0.5, 4])
    .on('zoom', (event) => container.attr('transform', event.transform));
  svg.call(zoom);

  N[0].fx = W / 2; N[0].fy = H / 2;
  const link = container.append('g').attr('stroke', 'rgba(255, 255, 255, 0.12)').attr('stroke-width', 1.5).selectAll('line').data(L).join('line');
  const node = container.append('g').selectAll('circle').data(N).join('circle')
    .attr('r', rad)
    .attr('fill', col)
    .attr('stroke', n => n.ghost ? '#38bdf8' : 'rgba(255,255,255,0.25)')
    .attr('stroke-width', n => n.ghost ? 1.5 : 1)
    .attr('stroke-dasharray', n => n.ghost ? '3 3' : null)
    .attr('cursor', 'pointer')
    .attr('filter', n => n.n >= 3 ? ((n.mv && n.bad / n.mv >= .2) || n.sc / n.n < .4 ? 'url(#glow-orange)' : 'url(#glow-green)') : null);

  node.append('title').text(n => n.ghost
    ? `✨ ${n.name} (${n.eco})\nUnexplored Book Branch`
    : `${pretty(n.id)}${n.name ? `\n📖 ${n.name} (${n.eco})` : ''}\n🎮 ${n.n} games · ${Math.round(n.sc / (n.n || 1) * 100)}% score` + (n.mv ? `\n⚠️ ${Math.round(n.bad / n.mv * 100)}% blunder rate` : ''));

  const text = container.append('g').attr('fill', '#e2e8f0').attr('font-size', 11).attr('font-weight', '500').attr('pointer-events', 'none').selectAll('text').data(lab).join('text')
    .attr('paint-order', 'stroke')
    .attr('stroke', '#0a0b0e')
    .attr('stroke-width', 3)
    .attr('stroke-linejoin', 'round')
    .text(n => n.name.length > 28 ? n.name.slice(0, 27) + '…' : n.name);

  const simulation = d3.forceSimulation(N)
    .force('link', d3.forceLink(L).id(d => d.id).distance(44).strength(0.85))
    .force('charge', d3.forceManyBody().strength(-85))
    .force('collide', d3.forceCollide(d => rad(d) + 4))
    .on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('cx', d => d.x).attr('cy', d => d.y);
      text.attr('x', d => d.x + rad(d) + 4).attr('y', d => d.y + 4);
    });
}

// "What's working": results grouped by opening family.
export function openingTable(games, color, book) {
  const rows = new Map();
  for (const g of games.filter(x => x.color === color)) {
    let mv; try { const c = new Chess(); c.loadPgn(g.pgn); mv = c.history(); } catch { continue; }
    const e = classify(mv, book), name = e ? e.name.split(':')[0] : 'Unclassified';
    const r = rows.get(name) || { name, n: 0, w: 0, d: 0, l: 0 }; rows.set(name, r);
    r.n++; r[g.result === 'win' ? 'w' : g.result === 'draw' ? 'd' : 'l']++;
  }
  return [...rows.values()].map(r => ({ ...r, score: (r.w + r.d / 2) / r.n })).sort((a, b) => b.n - a.n).slice(0, 15);
}
