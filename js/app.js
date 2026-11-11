import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0/+esm';
import { runQueue, accuracyOf } from './engine.js';
import { explainPly, formatCoachCard, summarize } from './coach.js';
import { startRewind } from './rewind.js';
import { renderPlan } from './plan.js';
import { detect } from './themes.js';
import { drawGalaxy, openingTable } from './galaxy.js';
import { loadBook, classify } from './book.js';
import { renderTraps } from './traps.js';
import { gameDb, saveGame, saveGames, loadAllGames, setStoredUser, getStoredUser } from './data.js';
import { createAppState } from './app-state.js';
import { playMove, playCapture, toggleSound, isSoundEnabled } from './sound.js';

const db = gameDb;
const $ = id => document.getElementById(id);
const DRAWS = ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'];
const state = createAppState();
state.flipped = false;
state.autoplayInterval = null;

const { all } = state;
const status = t => {
  const el = $('status');
  if (el) el.textContent = t;
};
const save = g => saveGame(g);

// --- Theme Management ---
function initTheme() {
  const saved = localStorage.getItem('chess_coach_theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  setTheme(saved);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('chess_coach_theme', theme);
  const icon = $('themeIcon');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  setTheme(cur === 'dark' ? 'light' : 'dark');
}

// --- Sound Management ---
function updateSoundIcon() {
  const icon = $('soundIcon');
  if (icon) icon.textContent = isSoundEnabled() ? '🔊' : '🔇';
}

// --- Data Fetching & Import ---
function mapChesscom(g, user) {
  if (!g.pgn || g.rules !== 'chess') return null;
  const white = g.white.username.toLowerCase() === user.toLowerCase();
  const me = white ? g.white : g.black;
  const result = me.result === 'win' ? 'win' : DRAWS.includes(me.result) ? 'draw' : 'loss';
  return {
    url: g.url,
    pgn: g.pgn,
    time_class: g.time_class,
    end_time: g.end_time,
    color: white ? 'w' : 'b',
    result,
    rating: me.rating,
    opponent: (white ? g.black : g.white).username
  };
}

async function fetchGames(user) {
  setStoredUser(user);
  status('Connecting to Chess.com public archives…');
  const fetchBtn = $('fetch');
  if (fetchBtn) fetchBtn.disabled = true;
  try {
    const r = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`);
    if (!r.ok) {
      status(`Could not locate Chess.com player "${user}". Check the spelling and retry.`);
      return;
    }
    const archives = (await r.json()).archives.reverse();
    let n = 0;
    for (const [i, url] of archives.entries()) {
      status(`Downloading games: month ${i + 1} of ${archives.length}…`);
      const res = await fetch(url);
      if (!res.ok) continue;
      const have = new Set(await db.games.where('url').anyOf((await res.clone().json()).games.map(g => g.url)).primaryKeys());
      const fresh = (await res.json()).games.filter(g => !have.has(g.url)).map(g => mapChesscom(g, user)).filter(Boolean);
      await saveGames(fresh);
      n += fresh.length;
      await load();
      if (i === 0) startQueue();
    }
    status(`Sync complete. Added ${n} new games to browser database.`);
    startQueue();
  } catch (err) {
    status(`Error fetching games: ${err.message}`);
  } finally {
    if (fetchBtn) fetchBtn.disabled = false;
  }
}

async function importPgn(text, user) {
  const parts = text.split(/\n\n(?=\[Event )/).filter(s => s.includes('['));
  const rows = [];
  for (const p of parts) {
    const c = new Chess();
    try { c.loadPgn(p); } catch { continue; }
    const h = c.getHeaders();
    const mine = user && h.Black?.toLowerCase() === user.toLowerCase() ? 'b' : 'w';
    const r = h.Result;
    const win = (r === '1-0' && mine === 'w') || (r === '0-1' && mine === 'b');
    const d = new Date(`${(h.UTCDate || h.Date || '1970.01.01').replace(/\./g, '-')}T${h.UTCTime || '00:00:00'}Z`);
    rows.push({
      url: 'upload:' + p.length + ':' + (h.White || '') + (h.Black || '') + (h.UTCDate || h.Date || '') + (h.UTCTime || ''),
      pgn: p,
      time_class: 'upload',
      end_time: Math.floor(d / 1000) || 0,
      color: mine,
      result: r === '1/2-1/2' ? 'draw' : win ? 'win' : 'loss',
      rating: +(h[mine === 'w' ? 'WhiteElo' : 'BlackElo']) || null,
      opponent: h[mine === 'w' ? 'Black' : 'White'] || '?'
    });
  }
  await saveGames(rows);
  await load();
  status(`Imported ${rows.length} games successfully.`);
  startQueue();
}

async function startQueue() {
  if (state.queueRunning) return;
  state.queueRunning = true;
  $('prog').style.display = 'flex';
  try {
    await runQueue(await loadAllGames(), save, (d, t) => {
      const pct = Math.round((d / t) * 100);
      $('bar').style.width = pct + '%';
      $('ptxt').textContent = `Analyzed ${d}/${t} games (${pct}%)`;
      if (d % 5 === 0 || d === t) load();
    });
    await load();
  } catch (e) {
    $('ptxt').textContent = 'Stockfish engine error. Verify vendor/stockfish-19-lite-single.js and .wasm.';
    console.error(e);
  }
  state.queueRunning = false;
}

// --- Dashboard Loading ---
async function load() {
  state.all = await loadAllGames();
  if (!state.all.length) return;
  all.length = 0;
  all.push(...state.all);

  for (const g of all) {
    if (g.analysis?.plies?.length && g.analysis.accv !== 2) {
      g.analysis.accuracy = accuracyOf(g.analysis.plies);
      g.analysis.accv = 2;
      save(g);
    }
  }

  $('nav').hidden = false;
  if (!state.view) setView('plan');

  const classes = [...new Set(all.map(g => g.time_class))].sort();
  if (!state.tab || !classes.includes(state.tab)) {
    state.tab = classes.includes('rapid') ? 'rapid' : classes[0];
  }
  const tab = state.tab;

  $('tabs').innerHTML = classes.map(c => `
    <button class="${c === tab ? 'on' : ''}" data-c="${c}">
      ${c.toUpperCase()} (${all.filter(g => g.time_class === c).length})
    </button>`).join('');

  const gs = all.filter(g => g.time_class === tab).sort((a, b) => b.end_time - a.end_time);
  const cnt = k => gs.filter(g => g.result === k).length;
  const accs = gs.filter(g => g.analysis?.accuracy).map(g => g.analysis.accuracy[g.color]).filter(a => a != null);
  const acc = accs.length ? (accs.reduce((a, b) => a + b) / accs.length).toFixed(1) + '%' : '–';

  $('stats').innerHTML = [
    [gs.length, 'Total Games', '♟️'],
    [`${cnt('win')}/${cnt('draw')}/${cnt('loss')}`, 'Win / Draw / Loss', '🏆'],
    [acc, `Avg Accuracy (${accs.length} evaluated)`, '🎯'],
    [gs.find(g => g.rating)?.rating ?? '–', 'Latest Rating', '⚡']
  ].map(([val, label, icon]) => `
    <div class="stat-card">
      <span style="font-size:20px">${icon}</span>
      <b>${val}</b>
      <span>${label}</span>
    </div>`).join('');

  heat(gs);
  renderPlanView();

  $('games').innerHTML = gs.slice(0, 200).map(g => `
    <div class="game-row" data-u="${g.url}">
      <div class="game-main-info">
        <span class="res-pill ${g.result}">${g.result[0].toUpperCase()}</span>
        <div>
          <div class="game-opp">vs ${g.opponent}</div>
          <div class="game-meta">
            <span>${new Date(g.end_time * 1000).toLocaleDateString()}</span>
            <span>·</span>
            <span>${g.time_class}</span>
            ${g.rating ? `<span>· ${g.rating}</span>` : ''}
          </div>
        </div>
      </div>
      <div>
        <span class="badge ${g.analysis?.accuracy ? 'badge-info' : ''}">
          ${g.analysis?.accuracy ? Math.round(g.analysis.accuracy[g.color]) + '% accuracy' : 'queueing'}
        </span>
      </div>
    </div>`).join('');
}

function heat(gs) {
  const cell = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ n: 0, s: 0 })));
  for (const g of gs) {
    const d = new Date(g.end_time * 1000);
    const c = cell[(d.getDay() + 6) % 7][d.getHours()];
    c.n++;
    c.s += g.result === 'win' ? 1 : g.result === 'draw' ? 0.5 : 0;
  }
  let h = '<span></span>' + [...Array(24).keys()].map(i => `<span>${i % 3 ? '' : i + 'h'}</span>`).join('');
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((day, r) => {
    h += `<span>${day}</span>`;
    for (let i = 0; i < 24; i++) {
      const c = cell[r][i];
      const p = c.n ? c.s / c.n : 0;
      h += c.n
        ? `<i title="${day} at ${i}:00 — ${c.n} games, ${Math.round(p * 100)}% score" style="background:hsl(${p * 120} 60% 45% / ${Math.min(1, 0.35 + c.n / 8)})"></i>`
        : '<i></i>';
    }
  });
  $('heat').innerHTML = h;
}

// --- Game Review ---
let rg, fens, ply, rb, rmv, rclk;

async function boardFor(el, fen, color) {
  try {
    return (await import('./board.js')).makeBoard(el, fen, color);
  } catch (e) {
    el.innerHTML = '<p class="mute">Board component failed to load. Check vendor/cm-chessboard assets.</p>';
    console.error(e);
    return null;
  }
}

async function openGame(url) {
  rg = all.find(g => g.url === url);
  if (!rg) return;
  const c = new Chess();
  c.loadPgn(rg.pgn);
  const mv = c.history({ verbose: true });
  fens = [new Chess().fen(), ...mv.map(m => m.after)];
  ply = mv.length;
  rmv = mv;
  rclk = {};

  for (const x of c.getComments?.() ?? []) {
    const t = x.comment.match(/\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/);
    if (t) rclk[x.fen] = +t[1] * 3600 + +t[2] * 60 + +t[3];
  }

  const log = JSON.parse(localStorage.reviews || '[]');
  log.push({ t: Date.now(), u: url });
  localStorage.reviews = JSON.stringify(log.slice(-200));

  $('rev').style.display = 'grid';
  $('rtitle').innerHTML = `vs ${rg.opponent} <span class="res-pill ${rg.result}" style="display:inline-flex; width:auto; padding:2px 8px; font-size:12px;">${rg.result.toUpperCase()}</span>`;
  $('ropening').textContent = '';

  const gm = rg;
  loadBook().then(b => {
    const e = classify(rmv.map(m => m.san), b);
    if (e && rg === gm) {
      $('ropening').innerHTML = `<b>${e.name}</b> <span class="badge badge-info">${e.eco}</span>`;
    }
  });

  const pl = rg.analysis?.plies || [];

  // Update Accuracy Widget
  if (rg.analysis?.accuracy) {
    $('whiteAccScore').textContent = Math.round(rg.analysis.accuracy.w || 0) + '%';
    $('blackAccScore').textContent = Math.round(rg.analysis.accuracy.b || 0) + '%';
    const total = (rg.analysis.accuracy.w || 50) + (rg.analysis.accuracy.b || 50);
    const whiteRatio = Math.round(((rg.analysis.accuracy.w || 50) / total) * 100);
    $('accBarWhite').style.width = whiteRatio + '%';
    $('accBarBlack').style.width = (100 - whiteRatio) + '%';
  } else {
    $('whiteAccScore').textContent = '–';
    $('blackAccScore').textContent = '–';
    $('accBarWhite').style.width = '50%';
    $('accBarBlack').style.width = '50%';
  }

  // Count grades for current player
  const myGrades = pl.filter(p => p.color === rg.color);
  const countGrade = g => myGrades.filter(p => p.grade === g).length;
  $('gradeChips').innerHTML = `
    ${countGrade('brilliant') ? `<span class="grade-chip"><span class="move-glyph brilliant"></span> ${countGrade('brilliant')} Brilliant</span>` : ''}
    <span class="grade-chip"><span class="move-glyph best"></span> ${countGrade('best')} Best</span>
    <span class="grade-chip"><span class="move-glyph excellent"></span> ${countGrade('excellent')} Excellent</span>
    <span class="grade-chip"><span class="move-glyph inaccuracy"></span> ${countGrade('inaccuracy')} Inaccuracies</span>
    <span class="grade-chip"><span class="move-glyph mistake"></span> ${countGrade('mistake')} Mistakes</span>
    <span class="grade-chip"><span class="move-glyph blunder"></span> ${countGrade('blunder')} Blunders</span>
  `;

  // Render 2-Column Move List
  const moveRows = [];
  for (let i = 0; i < mv.length; i += 2) {
    const w = mv[i];
    const b = mv[i + 1];
    const wGrade = pl[i]?.grade || '';
    const bGrade = b ? (pl[i + 1]?.grade || '') : '';
    moveRows.push(`
      <div class="move-row">
        <span class="move-num">${i / 2 + 1}.</span>
        <span class="move-cell" data-p="${i + 1}">
          <span class="move-glyph ${wGrade}"></span>
          <span>${w.san}</span>
        </span>
        ${b ? `
        <span class="move-cell" data-p="${i + 2}">
          <span class="move-glyph ${bGrade}"></span>
          <span>${b.san}</span>
        </span>` : '<span></span>'}
      </div>
    `);
  }
  $('moves').innerHTML = moveRows.join('') + (pl.length ? '' : '<p class="mute" style="padding:10px;">Evaluating in background queue...</p>');

  const sm = summarize(rg, pl, explainAt);
  $('csum').hidden = !sm;
  $('csum').textContent = sm;

  rb?.destroy?.();
  const orient = state.flipped ? (rg.color === 'w' ? 'b' : 'w') : rg.color;
  rb = await boardFor($('board'), fens[ply], orient);
  show(ply, false);
  $('rev').scrollIntoView({ behavior: 'smooth' });
}

function show(p, triggerSound = true) {
  const prevP = ply;
  ply = Math.max(0, Math.min(fens.length - 1, p));
  rb?.setPosition(fens[ply], true);
  drawOverlay(fens[ply]);

  // Audio feedback
  if (triggerSound && ply !== prevP) {
    if (ply > prevP && rmv[ply - 1]?.captured) {
      playCapture();
    } else {
      playMove();
    }
  }

  const a = rg.analysis?.plies?.[ply - 1];
  updateEvalBar(a ? a.cp : 0);

  if (a) {
    const evalText = (a.cp >= 0 ? '+' : '') + (a.cp / 100).toFixed(1);
    $('info').innerHTML = `<span class="badge ${a.grade}">${a.grade.toUpperCase()}</span> <span>eval ${evalText}</span>`;
  } else {
    $('info').textContent = ply === 0 ? 'Starting Position' : '';
  }

  coachFor(ply - 1);

  // Active move highlighting & scrolling
  document.querySelectorAll('#moves [data-p]').forEach(e => {
    const isCur = +e.dataset.p === ply;
    e.classList.toggle('cur', isCur);
    if (isCur) {
      e.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

function updateEvalBar(cp) {
  const bar = $('evalBarFill');
  const text = $('evalBarText');
  if (!bar || !text) return;

  // Convert centipawns to win percentage (0 to 100)
  const wp = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  const orient = state.flipped ? (rg?.color === 'w' ? 'b' : 'w') : (rg?.color || 'w');
  const heightPct = orient === 'w' ? wp : (100 - wp);

  bar.style.height = `${heightPct}%`;

  if (Math.abs(cp) >= 9000) {
    text.textContent = cp > 0 ? '+M' : '-M';
  } else {
    text.textContent = (cp >= 0 ? '+' : '') + (cp / 100).toFixed(1);
  }
}

function explainAt(i) {
  const pl = rg.analysis.plies, m = rmv[i];
  return explainPly({
    fenBefore: fens[i],
    fenAfter: fens[i + 1],
    move: m,
    ply: pl[i],
    prevCp: i ? pl[i - 1].cp : 0,
    next: rmv[i + 1],
    clk: rclk[m.after] ?? null,
    userColor: rg.color,
    idx: i
  });
}

function coachFor(i) {
  const el = $('coach');
  const p = rg.analysis?.plies?.[i];
  const on = p && ['inaccuracy', 'mistake', 'blunder', 'brilliant', 'best'].includes(p.grade);
  el.hidden = !on;
  if (on) {
    const o = {
      fenBefore: fens[i],
      fenAfter: fens[i + 1],
      move: rmv[i],
      ply: p,
      prevCp: i ? rg.analysis.plies[i - 1].cp : 0,
      next: rmv[i + 1],
      clk: rclk[rmv[i].after] ?? null,
      userColor: rg.color,
      idx: i
    };
    el.innerHTML = formatCoachCard(o);
  }
}

function drawOverlay(fen) {
  const items = $('ovToggle').checked ? detect(fen) : [];
  const orient = state.flipped ? (rg.color === 'w' ? 'b' : 'w') : rg.color;
  const flip = orient === 'b';
  const X = s => (flip ? 7 - 'abcdefgh'.indexOf(s[0]) : 'abcdefgh'.indexOf(s[0])) + 0.5;
  const Y = s => (flip ? +s[1] - 1 : 8 - +s[1]) + 0.5;

  let h = '<defs><marker id="ah" viewBox="0 0 6 6" refX="4" refY="3" markerWidth="3" markerHeight="3" orient="auto"><path d="M0 0L6 3L0 6z" fill="#f43f5e"/></marker></defs>';
  for (const t of items) {
    for (const to of [].concat(t.to)) {
      if (to !== t.from) {
        h += `<line x1="${X(t.from)}" y1="${Y(t.from)}" x2="${X(to)}" y2="${Y(to)}" stroke="#f43f5e" stroke-opacity=".8" stroke-width=".12" marker-end="url(#ah)"/>`;
      }
    }
    h += `<text x="${X(t.at) + 0.22}" y="${Y(t.at) - 0.2}" font-size=".44" text-anchor="middle" dominant-baseline="central">${t.icon}</text>`;
  }
  $('ov').innerHTML = h;
  $('tactics').innerHTML = items.map(t => `<li>${t.icon} ${t.text}</li>`).join('') || '<li style="background:transparent; border:none; color:var(--text-faint);">No tactical vulnerabilities on board.</li>';
}

function toggleAutoplay() {
  if (state.autoplayInterval) {
    clearInterval(state.autoplayInterval);
    state.autoplayInterval = null;
    $('autoplay').textContent = '▶';
  } else {
    $('autoplay').textContent = '⏸';
    state.autoplayInterval = setInterval(() => {
      if (ply >= fens.length - 1) {
        toggleAutoplay();
      } else {
        show(ply + 1);
      }
    }, 1200);
  }
}

async function toggleFlip() {
  state.flipped = !state.flipped;
  const orient = state.flipped ? (rg.color === 'w' ? 'b' : 'w') : rg.color;
  rb?.destroy?.();
  rb = await boardFor($('board'), fens[ply], orient);
  show(ply, false);
}

// --- Views Management ---
const VIEWS = { plan: 'plan', dash: 'dash', rewind: 'rewindv', galaxy: 'galaxyv', traps: 'trapv' };
let trapSet = [];

function setView(v, custom) {
  state.view = v;
  for (const [k, id] of Object.entries(VIEWS)) {
    const el = $(id);
    if (el) el.hidden = k !== v;
  }
  if (v !== 'dash') $('rev').style.display = 'none';

  document.querySelectorAll('#nav button').forEach(b => {
    b.classList.toggle('on', b.dataset.v === v);
  });

  if (v === 'rewind') {
    $('rwtitle').textContent = custom ? 'Trap Drill' : 'Blunder Rewind';
    startRewind(db, all, $, renderPlanView, custom);
  }
  if (v === 'galaxy') renderGalaxy();
  if (v === 'traps') trapSet = renderTraps($('trapbody'), all);
}

async function renderPlanView() {
  $('planbody').innerHTML = renderPlan(all, await db.rewind.toArray());
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function renderGalaxy() {
  const color = $('galColor').value;
  const book = await loadBook();
  $('galnote').textContent = book.size ? '' : 'Offline book cache unavailable; using online opening repertoire.';
  drawGalaxy($('gal'), all, color, book, $('galGhost').checked);
  const rows = openingTable(all, color, book);
  $('galtable').innerHTML = rows.length
    ? '<table class="opening-table"><tr><th>Opening System</th><th>Games Played</th><th>W / D / L</th><th>Win Score</th></tr>'
      + rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${r.n}</td><td>${r.w}/${r.d}/${r.l}</td><td>${Math.round(r.score * 100)}%</td></tr>`).join('') + '</table>'
    : '<p class="mute">No opening games detected yet.</p>';
}

// --- Event Wiring ---
const userInput = $('user');
userInput.type = 'text';
userInput.autocomplete = 'username';
userInput.autocapitalize = 'none';
userInput.spellcheck = false;

$('fetch').onclick = () => userInput.value.trim() && fetchGames(userInput.value.trim());
userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    $('fetch').click();
  }
});

$('pgnBtn').onclick = () => $('pgn').click();
$('impBtn').onclick = () => $('imp').click();
$('pgn').onchange = async e => importPgn(await e.target.files[0].text(), userInput.value.trim());
$('exp').onclick = async () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(await db.games.toArray())], { type: 'application/json' }));
  a.download = 'chess-coach-backup.json';
  a.click();
};
$('imp').onchange = async e => {
  await db.games.bulkPut(JSON.parse(await e.target.files[0].text()));
  await load();
  status('Backup database restored successfully.');
  startQueue();
};

$('soundToggle').onclick = () => {
  toggleSound();
  updateSoundIcon();
};

$('themeToggle').onclick = toggleTheme;

$('tabs').onclick = e => {
  if (e.target.dataset.c) {
    state.tab = e.target.dataset.c;
    load();
  }
};
$('games').onclick = e => {
  const g = e.target.closest('.game-row');
  if (g) openGame(g.dataset.u);
};
$('moves').onclick = e => {
  const cell = e.target.closest('.move-cell');
  if (cell && cell.dataset.p) show(+cell.dataset.p);
};

// Board controls
$('first').onclick = () => show(0);
$('prev').onclick = () => show(ply - 1);
$('autoplay').onclick = toggleAutoplay;
$('next').onclick = () => show(ply + 1);
$('last').onclick = () => show(fens.length - 1);
$('flip').onclick = toggleFlip;

document.addEventListener('keydown', e => {
  const target = e.target;
  const isTextField = target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  if ($('rev').style.display === 'grid' && !isTextField) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(ply - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); show(ply + 1); }
    if (e.key === 'Home') { e.preventDefault(); show(0); }
    if (e.key === 'End') { e.preventDefault(); show(fens.length - 1); }
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFlip(); }
    if (e.key === ' ') { e.preventDefault(); toggleAutoplay(); }
  }
});

$('galColor').onchange = renderGalaxy;
$('galGhost').onchange = renderGalaxy;
$('ovToggle').onchange = () => rg && drawOverlay(fens[ply]);
$('trapbody').onclick = e => {
  const drillBtn = e.target.closest('[data-drill]');
  if (drillBtn) {
    const i = drillBtn.dataset.drill;
    if (i !== undefined) setView('rewind', trapSet[+i]);
  }
};
$('nav').onclick = e => {
  const btn = e.target.closest('[data-v]');
  if (btn) setView(btn.dataset.v);
};
$('planbody').onclick = e => {
  const vBtn = e.target.closest('[data-v]');
  if (vBtn) setView(vBtn.dataset.v);
  const openBtn = e.target.closest('[data-open]');
  if (openBtn) {
    setView('dash');
    openGame(openBtn.dataset.open);
  }
};

// Initialization
initTheme();
updateSoundIcon();
userInput.value = getStoredUser();
navigator.storage?.persist?.();
load().then(() => all.length && startQueue());
