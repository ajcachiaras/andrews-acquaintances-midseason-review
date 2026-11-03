/* Shared rendering for the midseason review.
   Inline SVG, no dependencies. REVIEW comes from data.js. */

const POS_ORDER = ['QB', 'RB', 'WR', 'TE'];
const POS_COLOR = { QB: 'var(--pos-qb)', RB: 'var(--pos-rb)', WR: 'var(--pos-wr)', TE: 'var(--pos-te)' };
const POS_NAME = { QB: 'Quarterbacks', RB: 'Running backs', WR: 'Wide receivers', TE: 'Tight ends' };

const fmt1 = n => n.toFixed(1);
const fmt2 = n => n.toFixed(2);
const money = n => '$' + n.toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const byPos = pos => REVIEW.players.filter(p => p.pos === pos);
const teamName = id => REVIEW.teams[id] || ('Roster ' + id);

/* ---------- tooltip ---------- */
const tip = document.getElementById('tip');
function showTip(e, html) {
  tip.innerHTML = html;
  tip.style.opacity = 1;
  const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + w > innerWidth - 8) x = e.clientX - w - pad;
  if (y + h > innerHeight - 8) y = e.clientY - h - pad;
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}
function hideTip() { tip.style.opacity = 0; }

function playerTip(p) {
  const ppd = p.ppd == null ? '—' : fmt2(p.ppd);
  const d = p.rankDelta;
  return `<b>${esc(p.name)}</b>
    <div class="row">${p.pos} · ${esc(p.nfl)} · ${money(p.cost)}</div>
    <div class="row">${fmt1(p.pts)} pts in ${p.gp} game${p.gp === 1 ? '' : 's'} · ${ppd} pts per $</div>
    <div class="row">paid as ${p.pos}${p.costRank}, playing as ${p.pos}${p.ptsRank} (${d >= 0 ? '+' : ''}${d})</div>
    <div class="row">drafted by ${esc(teamName(p.by))}</div>`;
}

/* ---------- nice axis ticks ---------- */
function ticks(lo, hi, target = 5) {
  const span = hi - lo || 1;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= target * 1.4) || mag * 10;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

/* ---------- scatter: dollars spent vs points scored ---------- */
function scatter(host, players, opts = {}) {
  const { color = 'var(--pos-qb)', label = false, compact = false } = opts;
  // A narrower viewBox in a facet means the same 11px axis type renders bigger
  // relative to the panel; at the full width in a 250px panel it was ~4px.
  const W = compact ? 340 : 760, H = compact ? 270 : 400;
  const padL = compact ? 36 : 48, padR = compact ? 12 : 70, padT = 14, padB = compact ? 40 : 46;
  const pw = W - padL - padR, ph = H - padT - padB;

  const maxX = Math.max(...players.map(p => p.cost), 10);
  const maxY = Math.max(...players.map(p => p.pts), 10);
  const xt = ticks(0, maxX), yt = ticks(0, maxY);
  const hiX = Math.max(maxX, xt[xt.length - 1]), hiY = Math.max(maxY, yt[yt.length - 1]);
  const X = v => padL + (v / hiX) * pw;
  const Y = v => padT + ph - (v / hiY) * ph;

  let s = '';
  yt.forEach(v => {
    s += `<line class="grid-line" x1="${padL}" y1="${Y(v)}" x2="${W - padR}" y2="${Y(v)}"/>`;
    s += `<text class="axis-text" x="${padL - 8}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  });
  xt.forEach(v => {
    s += `<text class="axis-text" x="${X(v)}" y="${H - 26}" text-anchor="middle">$${v}</text>`;
  });
  s += `<text class="axis-title" x="${padL + pw / 2}" y="${H - 6}" text-anchor="middle">Auction price</text>`;
  s += `<text class="axis-title" transform="translate(13,${padT + ph / 2}) rotate(-90)" text-anchor="middle">Fantasy points, weeks 1–${REVIEW.through}</text>`;

  // Market line: what this position's prices actually bought, on average.
  const withExp = players.filter(p => p.exp != null);
  if (withExp.length > 2) {
    const a = withExp.reduce((m, p) => p.cost < m.cost ? p : m, withExp[0]);
    const b = withExp.reduce((m, p) => p.cost > m.cost ? p : m, withExp[0]);
    s += `<line class="trend" x1="${X(a.cost)}" y1="${Y(Math.max(0, a.exp))}" x2="${X(b.cost)}" y2="${Y(Math.max(0, b.exp))}"/>`;
  }

  // Marks last, so they sit above the grid. 2px surface ring keeps overlapping
  // players readable -- 60 receivers pile up badly without it.
  players.forEach(p => {
    s += `<circle class="mark" data-id="${p.id}" cx="${X(p.cost)}" cy="${Y(p.pts)}" r="5" fill="${color}"/>`;
  });

  if (label) {
    // Only the extremes get a name; a label on every point is noise.
    const sorted = [...players].sort((x, y) => y.rankDelta - x.rankDelta);
    const picked = [...sorted.slice(0, 3), ...sorted.slice(-3)];
    const seen = new Set();
    picked.forEach(p => {
      if (seen.has(p.id)) return;
      seen.add(p.id);
      const right = X(p.cost) < padL + pw * 0.78;
      s += `<text class="mark-label" x="${X(p.cost) + (right ? 9 : -9)}" y="${Y(p.pts) + 4}"
        text-anchor="${right ? 'start' : 'end'}">${esc(p.name.split(' ').slice(-1)[0])}</text>`;
    });
  }

  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img"
    aria-label="Auction price against fantasy points scored, one dot per drafted player">${s}</svg>`;
  if (label) deCollide(host.querySelector('svg'));
  wireMarks(host, players);
}

/* Nudge outlier labels apart, and drop any that still has nowhere to sit --
   two names printed on top of each other name nobody. Measured with getBBox
   rather than estimated from character count, which left them overlapping. */
function deCollide(svg) {
  const placed = [];
  // getBBox gives width/height, not w/h -- reading b.w here compared against
  // undefined, which is always false, so nothing ever moved.
  const hits = (b, dy) => placed.some(p =>
    b.x < p.x + p.w && p.x < b.x + b.width &&
    b.y + dy < p.y + p.h && p.y < b.y + dy + b.height);
  svg.querySelectorAll('.mark-label').forEach(t => {
    const b = t.getBBox();
    const dy = [0, -13, 13, -26, 26, -39, 39].find(d => !hits(b, d));
    if (dy === undefined) { t.remove(); return; }
    t.setAttribute('y', +t.getAttribute('y') + dy);
    const n = t.getBBox();
    placed.push({ x: n.x, y: n.y, w: n.width, h: n.height });
  });
}

function wireMarks(host, players) {
  const index = new Map(players.map(p => [p.id, p]));
  const svg = host.querySelector('svg');
  svg.addEventListener('pointermove', e => {
    const m = e.target.closest('[data-id]');
    if (!m) { hideTip(); return; }
    const p = index.get(m.dataset.id);
    if (p) showTip(e, playerTip(p));
  });
  svg.addEventListener('pointerleave', hideTip);
}

/* ---------- diverging bars: price rank vs production rank ---------- */
function rankBars(host, players, pos) {
  const rows = [...players].sort((a, b) => b.rankDelta - a.rankDelta);
  const rowH = 20, padT = 24, padB = 34, padL = 136, padR = 46;
  const W = 760, H = padT + padB + rows.length * rowH;
  const pw = W - padL - padR;
  const maxAbs = Math.max(...rows.map(r => Math.abs(r.rankDelta)), 1);
  const mid = padL + pw / 2;
  const scale = v => (v / maxAbs) * (pw / 2);

  let s = `<line class="grid-line" x1="${mid}" y1="${padT - 6}" x2="${mid}" y2="${H - padB + 2}"/>`;
  [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs].forEach(v => {
    const x = mid + scale(v);
    s += `<text class="axis-text" x="${x}" y="${padT - 11}" text-anchor="middle">${v > 0 ? '+' : ''}${Math.round(v)}</text>`;
  });
  s += `<text class="axis-title" x="${mid}" y="${H - 8}" text-anchor="middle">Places gained or lost against what he cost</text>`;

  rows.forEach((p, i) => {
    const y = padT + i * rowH;
    const d = p.rankDelta;
    const w = Math.abs(scale(d));
    const x = d >= 0 ? mid : mid - w;
    const col = d > 0 ? 'var(--div-pos)' : d < 0 ? 'var(--div-neg)' : 'var(--div-mid)';
    // 2px gap between bars, 4px rounded data-end.
    s += `<rect class="mark" data-id="${p.id}" x="${x}" y="${y + 1}" width="${Math.max(w, 1)}" height="${rowH - 3}" rx="3" fill="${col}"/>`;
    s += `<text class="axis-text" x="${padL - 10}" y="${y + rowH / 2 + 4}" text-anchor="end">${esc(p.name)}</text>`;
    s += `<text class="axis-text" x="${d >= 0 ? mid + w + 7 : mid - w - 7}" y="${y + rowH / 2 + 4}"
      text-anchor="${d >= 0 ? 'start' : 'end'}">${d > 0 ? '+' : ''}${d}</text>`;
  });

  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img"
    aria-label="Each ${pos}'s production rank compared with his price rank">${s}</svg>`;
  wireMarks(host, rows);
}

/* ---------- table ---------- */
const COLS = [
  { k: 'ptsRank', h: '#', num: true, cell: p => p.ptsRank },
  { k: 'name', h: 'Player', cell: p => `<span class="who">${esc(p.name)}</span><br><span class="meta">${esc(p.nfl)}</span>` },
  { k: 'by', h: 'Drafted by', cell: p => `<span class="meta">${esc(teamName(p.by))}</span>` },
  { k: 'cost', h: 'Price', num: true, cell: p => money(p.cost) },
  { k: 'pts', h: 'Points', num: true, cell: p => fmt1(p.pts) },
  { k: 'ppg', h: 'Per game', num: true, cell: p => fmt1(p.ppg) },
  { k: 'gp', h: 'GP', num: true, cell: p => p.gp },
  { k: 'ppd', h: 'Pts / $', num: true, cell: p => p.ppd == null ? '—' : fmt2(p.ppd) },
  {
    k: 'rankDelta', h: 'Price → play', num: true,
    cell: p => `<span class="chip">${p.pos}${p.costRank} → ${p.pos}${p.ptsRank}</span>
      <span class="${p.rankDelta > 0 ? 'delta-pos' : p.rankDelta < 0 ? 'delta-neg' : ''}">${p.rankDelta > 0 ? '+' : ''}${p.rankDelta}</span>`
  },
];

function table(host, players, sortKey = 'pts', dir = -1) {
  function draw() {
    const rows = [...players].sort((a, b) => {
      const col = COLS.find(c => c.k === sortKey);
      let av = a[sortKey], bv = b[sortKey];
      if (!col.num) { av = String(av === a.by ? teamName(a.by) : av); bv = String(bv === b.by ? teamName(b.by) : bv); return av.localeCompare(bv) * dir; }
      return ((av ?? -Infinity) - (bv ?? -Infinity)) * dir;
    });
    host.innerHTML = `<table><thead><tr>${COLS.map(c =>
      `<th data-k="${c.k}"${c.k === sortKey ? ` aria-sort="${dir === -1 ? 'descending' : 'ascending'}"` : ''}>${c.h}${
        c.k === sortKey ? ` <span class="arrow">${dir === -1 ? '▼' : '▲'}</span>` : ''}</th>`).join('')
      }</tr></thead><tbody>${rows.map(p =>
        `<tr>${COLS.map(c => `<td>${c.cell(p)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    host.querySelectorAll('th').forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.k;
      if (k === sortKey) dir = -dir; else { sortKey = k; dir = -1; }
      draw();
    }));
  }
  draw();
}

/* ---------- shared chrome ---------- */
function nav(current) {
  const items = [['index.html', 'Overview', null],
    ...POS_ORDER.map(p => [p.toLowerCase() + '.html', POS_NAME[p], p]),
    ['teams.html', 'Teams', null]];
  return `<nav class="tabs">${items.map(([href, text, pos]) =>
    `<a href="${href}"${href === current ? ' aria-current="page"' : ''}>${
      pos ? `<span class="swatch" style="background:${POS_COLOR[pos]}"></span>` : ''}${text}</a>`).join('')}</nav>`;
}

function footer() {
  return `<footer class="page">
    <p>Prices are the 2026 auction draft; points are every drafted player's actual
    production in weeks 1&ndash;${REVIEW.through}, scored under this league's own settings
    (0.5&nbsp;PPR, 4-point passing TDs, 0.25 TE reception bonus) &mdash; not a generic half-PPR number.</p>
    <p>Production counts wherever the player played, including after the team that drafted him
    was eliminated. It measures what the money bought, not what each manager kept.</p>
    <p>Built from Sleeper by <code>build_data.py</code>. Data pulled ${REVIEW.generated}.
    Companion to the <a href="https://ajcachiaras.github.io/andrews-acquaintances-tracker/">Guillotine Watch tracker</a>.</p>
  </footer>`;
}
