import Dexie from 'https://cdn.jsdelivr.net/npm/dexie@4.0.8/+esm';
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0/+esm';
import { runQueue } from './engine.js';
import { makeBoard } from './board.js';
import { startRewind } from './rewind.js';
import { renderPlan } from './plan.js';
import { detect } from './themes.js';
import { drawGalaxy } from './galaxy.js';
import { renderTraps } from './traps.js';

const db = new Dexie('chess-coach');
db.version(1).stores({ games: 'url,time_class,end_time' });
db.version(2).stores({ games: 'url,time_class,end_time', rewind: 'id' });
const $ = id => document.getElementById(id);
const DRAWS = ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'];
let all = [], tab = null, queueRunning = false, view = null;
const status = t => $('status').textContent = t;
const save = g => db.games.put(g);

function mapChesscom(g, user) {
  if (!g.pgn || g.rules !== 'chess') return null;
  const white = g.white.username.toLowerCase() === user.toLowerCase();
  const me = white ? g.white : g.black;
  const result = me.result === 'win' ? 'win' : DRAWS.includes(me.result) ? 'draw' : 'loss';
  return { url: g.url, pgn: g.pgn, time_class: g.time_class, end_time: g.end_time, color: white ? 'w' : 'b',
    result, rating: me.rating, opponent: (white ? g.black : g.white).username };
}

async function fetchGames(user) {
  localStorage.setItem('user', user);
  status('Finding your game archives…');
  const r = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`);
  if (!r.ok) return status(`Chess.com couldn't find "${user}". Check the spelling and try again.`);
  const archives = (await r.json()).archives.reverse(); // newest month first
  let n = 0;
  for (const [i, url] of archives.entries()) {
    status(`Downloading games: month ${i + 1} of ${archives.length}…`);
    const res = await fetch(url); if (!res.ok) continue;
    const have = new Set(await db.games.where('url').anyOf((await res.clone().json()).games.map(g => g.url)).primaryKeys());
    const fresh = (await res.json()).games.filter(g => !have.has(g.url)).map(g => mapChesscom(g, user)).filter(Boolean);
    await db.games.bulkPut(fresh); n += fresh.length;
    await load(); // dashboard fills in as games arrive
    if (i === 0) startQueue(); // analyse newest game right away
  }
  status(`Done. ${n} new games added.`); startQueue();
}

async function importPgn(text, user) {
  const parts = text.split(/\n\n(?=\[Event )/).filter(s => s.includes('['));
  const rows = [];
  for (const p of parts) {
    const c = new Chess(); try { c.loadPgn(p); } catch { continue; }
    const h = c.getHeaders(), mine = user && h.Black?.toLowerCase() === user.toLowerCase() ? 'b' : 'w';
    const r = h.Result, win = (r === '1-0' && mine === 'w') || (r === '0-1' && mine === 'b');
    const d = new Date(`${(h.UTCDate || h.Date || '1970.01.01').replace(/\./g, '-')}T${h.UTCTime || '00:00:00'}Z`);
    rows.push({ url: 'upload:' + p.length + ':' + (h.White || '') + (h.Black || '') + (h.UTCDate || h.Date || '') + (h.UTCTime || ''),
      pgn: p, time_class: 'upload', end_time: Math.floor(d / 1000) || 0, color: mine,
      result: r === '1/2-1/2' ? 'draw' : win ? 'win' : 'loss', rating: +(h[mine === 'w' ? 'WhiteElo' : 'BlackElo']) || null,
      opponent: h[mine === 'w' ? 'Black' : 'White'] || '?' });
  }
  await db.games.bulkPut(rows); await load(); status(`Imported ${rows.length} games.`); startQueue();
}

async function startQueue() {
  if (queueRunning) return; queueRunning = true; $('prog').style.display = 'block';
  try {
    await runQueue(await db.games.toArray(), save, (d, t) => {
      $('bar').style.width = (d / t * 100) + '%'; $('ptxt').textContent = `Analyzed ${d}/${t} (${Math.round(d / t * 100)}%)`;
      if (d % 5 === 0 || d === t) load();
    });
    await load();
  } catch (e) { $('ptxt').textContent = 'Engine not found. Run scripts/vendor.sh once (see README).'; console.error(e); }
  queueRunning = false;
}

async function load() {
  all = await db.games.toArray(); if (!all.length) return;
  $('nav').hidden = false; if (!view) setView('plan');
  const classes = [...new Set(all.map(g => g.time_class))].sort();
  if (!tab || !classes.includes(tab)) tab = classes.includes('rapid') ? 'rapid' : classes[0];
  $('tabs').innerHTML = classes.map(c => `<button class="${c === tab ? 'on' : ''}" data-c="${c}">${c} (${all.filter(g => g.time_class === c).length})</button>`).join('');
  const gs = all.filter(g => g.time_class === tab).sort((a, b) => b.end_time - a.end_time);
  const cnt = k => gs.filter(g => g.result === k).length;
  const accs = gs.filter(g => g.analysis?.accuracy).map(g => g.analysis.accuracy[g.color]).filter(a => a != null);
  const acc = accs.length ? (accs.reduce((a, b) => a + b) / accs.length).toFixed(1) + '%' : '–';
  $('stats').innerHTML = [[gs.length, 'games'], [`${cnt('win')}/${cnt('draw')}/${cnt('loss')}`, 'W/D/L'],
    [acc, `avg accuracy (${accs.length} analyzed)`], [gs.find(g => g.rating)?.rating ?? '–', 'latest rating']]
    .map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
  heat(gs); renderPlanView();
  $('games').innerHTML = gs.slice(0, 200).map(g => `<div class="g" data-u="${g.url}"><span class="r ${g.result}">${g.result[0].toUpperCase()}</span>
    <span>vs ${g.opponent}</span><span class="mute">${new Date(g.end_time * 1000).toLocaleDateString()}</span>
    <span class="mute">${g.analysis?.accuracy ? Math.round(g.analysis.accuracy[g.color]) + '% acc' : 'not analyzed'}</span></div>`).join('');
}

function heat(gs) {
  const cell = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ n: 0, s: 0 })));
  for (const g of gs) { const d = new Date(g.end_time * 1000), c = cell[(d.getDay() + 6) % 7][d.getHours()];
    c.n++; c.s += g.result === 'win' ? 1 : g.result === 'draw' ? .5 : 0; }
  let h = '<span></span>' + [...Array(24).keys()].map(i => `<span>${i % 3 ? '' : i}</span>`).join('');
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((day, r) => {
    h += `<span>${day}</span>`;
    for (let i = 0; i < 24; i++) { const c = cell[r][i], p = c.n ? c.s / c.n : 0;
      h += c.n ? `<i title="${day} ${i}:00 — ${c.n} games, ${Math.round(p * 100)}% score" style="background:hsl(${p * 120} 55% 45% / ${Math.min(1, .3 + c.n / 8)})"></i>` : '<i></i>'; }
  });
  $('heat').innerHTML = h;
}

// --- Game review ---
let rg, fens, ply, rb;
function openGame(url) {
  rg = all.find(g => g.url === url); const c = new Chess(); c.loadPgn(rg.pgn);
  const mv = c.history({ verbose: true }); fens = [new Chess().fen(), ...mv.map(m => m.after)]; ply = mv.length;
  const log = JSON.parse(localStorage.reviews || '[]'); log.push({ t: Date.now(), u: url }); localStorage.reviews = JSON.stringify(log.slice(-200));
  $('rev').style.display = 'grid'; $('rtitle').textContent = `vs ${rg.opponent} (${rg.result})`;
  const pl = rg.analysis?.plies || [];
  $('moves').innerHTML = mv.map((m, i) => `${m.color === 'w' ? `<span class="mute">${i / 2 + 1}.</span>` : ''}<span data-p="${i + 1}" class="${pl[i]?.grade || ''}">${m.san}</span>`).join('')
    + (pl.length ? '' : '<p class="mute">This game hasn’t been analyzed yet. It will fill in as the queue runs.</p>');
  rb?.destroy?.(); rb = makeBoard($('board'), fens[ply], rg.color);
  show(ply); $('rev').scrollIntoView({ behavior: 'smooth' });
}
function show(p) {
  ply = Math.max(0, Math.min(fens.length - 1, p)); rb.setPosition(fens[ply], true); drawOverlay(fens[ply]);
  const a = rg.analysis?.plies[ply - 1];
  $('info').textContent = a ? `${a.grade} · eval ${(a.cp / 100).toFixed(1)}${a.loss > 5 ? ` · best was ${a.best}` : ''}` : '';
  document.querySelectorAll('#moves [data-p]').forEach(e => e.classList.toggle('cur', +e.dataset.p === ply));
}

function drawOverlay(fen) {
  const items = $('ovToggle').checked ? detect(fen) : [], flip = rg.color === 'b';
  const X = s => (flip ? 7 - 'abcdefgh'.indexOf(s[0]) : 'abcdefgh'.indexOf(s[0])) + .5, Y = s => (flip ? +s[1] - 1 : 8 - +s[1]) + .5;
  let h = '<defs><marker id="ah" viewBox="0 0 6 6" refX="4" refY="3" markerWidth="3" markerHeight="3" orient="auto"><path d="M0 0L6 3L0 6z" fill="#d9534f"/></marker></defs>';
  for (const t of items) {
    for (const to of [].concat(t.to)) if (to !== t.from)
      h += `<line x1="${X(t.from)}" y1="${Y(t.from)}" x2="${X(to)}" y2="${Y(to)}" stroke="#d9534f" stroke-opacity=".75" stroke-width=".1" marker-end="url(#ah)"/>`;
    h += `<text x="${X(t.at) + .22}" y="${Y(t.at) - .2}" font-size=".42" text-anchor="middle" dominant-baseline="central">${t.icon}</text>`;
  }
  $('ov').innerHTML = h; $('tactics').innerHTML = items.map(t => `<li>${t.icon} ${t.text}</li>`).join('');
}

// --- Views ---
const VIEWS = { plan: 'plan', dash: 'dash', rewind: 'rewindv', galaxy: 'galaxyv', traps: 'trapv' };
let trapSet = [];
function setView(v, custom) {
  view = v;
  for (const [k, id] of Object.entries(VIEWS)) $(id).hidden = k !== v;
  if (v !== 'dash') $('rev').style.display = 'none';
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'rewind') { $('rwtitle').textContent = custom ? 'Trap drill' : 'Blunder Rewind'; startRewind(db, all, $, renderPlanView, custom); }
  if (v === 'galaxy') drawGalaxy($('gal'), all, $('galColor').value);
  if (v === 'traps') trapSet = renderTraps($('trapbody'), all);
}
async function renderPlanView() { $('planbody').innerHTML = renderPlan(all, await db.rewind.toArray()); }

// --- Wiring ---
$('fetch').onclick = () => $('user').value.trim() && fetchGames($('user').value.trim());
$('user').onkeydown = e => e.key === 'Enter' && $('fetch').click();
$('pgnBtn').onclick = () => $('pgn').click(); $('impBtn').onclick = () => $('imp').click();
$('pgn').onchange = async e => importPgn(await e.target.files[0].text(), $('user').value.trim());
$('exp').onclick = async () => { const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(await db.games.toArray())], { type: 'application/json' }));
  a.download = 'chess-coach-backup.json'; a.click(); };
$('imp').onchange = async e => { await db.games.bulkPut(JSON.parse(await e.target.files[0].text())); await load(); status('Backup imported.'); startQueue(); };
$('tabs').onclick = e => { if (e.target.dataset.c) { tab = e.target.dataset.c; load(); } };
$('games').onclick = e => { const g = e.target.closest('.g'); if (g) openGame(g.dataset.u); };
$('moves').onclick = e => e.target.dataset.p && show(+e.target.dataset.p);
$('prev').onclick = () => show(ply - 1); $('next').onclick = () => show(ply + 1);
document.onkeydown = e => { if ($('rev').style.display === 'grid' && !/INPUT/.test(e.target.tagName)) { if (e.key === 'ArrowLeft') show(ply - 1); if (e.key === 'ArrowRight') show(ply + 1); } };

$('galColor').onchange = () => drawGalaxy($('gal'), all, $('galColor').value);
$('ovToggle').onchange = () => rg && drawOverlay(fens[ply]);
$('trapbody').onclick = e => { const i = e.target.dataset.drill; if (i !== undefined) setView('rewind', trapSet[+i]); };
$('nav').onclick = e => e.target.dataset.v && setView(e.target.dataset.v);
$('planbody').onclick = e => {
  if (e.target.dataset.v) setView(e.target.dataset.v);
  if (e.target.dataset.open) { setView('dash'); openGame(e.target.dataset.open); }
};
$('user').value = localStorage.getItem('user') || '';
navigator.storage?.persist?.();
load().then(() => all.length && startQueue());
