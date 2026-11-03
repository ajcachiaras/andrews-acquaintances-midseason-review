/* Team draft ranking. Depends on review.js and data.js. */

const BUDGET = 200;   // per-team auction budget; waivers are a separate pool

/* Where a pick sits in his own position's pool, on a 0-100 scale: 100 is the
   best player drafted at that position, 0 the worst. Normalising by pool size
   is the whole point -- 19 tight ends were drafted against 60 receivers, so a
   raw rank of 15 means something very different at each, and a raw sum quietly
   rewards a tight-end-heavy roster. */
function posPercentile(p) {
  if (!p.posN || p.posN < 2) return 50;
  return ((p.posN - p.ptsRank) / (p.posN - 1)) * 100;
}

function teamRows() {
  const t = {};
  REVIEW.players.forEach(p => {
    const r = t[p.by] || (t[p.by] = {
      id: p.by, cost: 0, pts: 0, n: 0, beat: 0, delta: 0,
      pos: { QB: 0, RB: 0, WR: 0, TE: 0 }, picks: []
    });
    r.cost += p.cost; r.pts += p.pts; r.n += 1;
    r.delta += p.rankDelta;
    if (p.rankDelta > 0) r.beat += 1;
    if (r.pos[p.pos] != null) r.pos[p.pos] += p.cost;
    r.picks.push(p);
  });
  return Object.values(t).map(r => ({
    ...r,
    name: teamName(r.id),
    // Sum of where each pick ranks at his own position. Nothing to do with
    // money: purely how good the eight players turned out to be. Lower is
    // better. avgPct is the same thing normalised by pool size, kept for the
    // tooltip because the pools are very different (19 TEs against 60 WRs).
    rankSum: r.picks.reduce((s, p) => s + p.ptsRank, 0),
    squadPct: r.picks.reduce((s, p) => s + posPercentile(p), 0) / r.picks.length,
    perSpent: r.cost ? r.pts / r.cost : 0,
    perBudget: r.pts / BUDGET,
    unspent: BUDGET - r.cost,
    out: REVIEW.eliminated[r.id] || null,
  })).sort((a, b) => b.pts - a.pts);
}

function teamTip(r) {
  const mix = [...r.picks]
    .sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || a.ptsRank - b.ptsRank)
    .map(p => `${p.pos}${p.ptsRank} of ${p.posN}`).join(' · ');
  return `<b>${esc(r.name)}</b>
    <div class="row">${fmt1(r.pts)} pts from ${r.n} picks</div>
    <div class="row">${money(r.cost)} spent${r.unspent > 0 ? `, ${money(r.unspent)} left unspent` : ''}</div>
    <div class="row">${fmt2(r.perSpent)} pts per $ spent &middot; ${fmt2(r.perBudget)} per $ of budget</div>
    <div class="row">${r.beat} of ${r.n} picks beating their price</div>
    <div class="row">squad score ${fmt1(r.squadPct)} of 100 &middot; raw rank sum ${r.rankSum}</div>
    <div class="row">${mix}</div>
    ${r.out ? `<div class="row">eliminated in week ${r.out}</div>` : ''}`;
}

/* On a phone a 760-wide viewBox renders at about 310px, which puts the 11px
   axis type at 4.5px and leaves nothing for a 184px name gutter. Narrow the
   viewBox and shorten the names instead. Every team's first word is unique. */
const narrowHost = host => (host.clientWidth || 900) < 460;
const shortTeam = name => name.split(' ')[0];

/* Ranked horizontal bars. One series, so no legend -- the title names it. */
function teamBars(host, rows, pick, opts = {}) {
  const { color = 'var(--pos-qb)', fmtVal = fmt1, note = () => '', colorFor = null,
          domainMax = null } = opts;
  const narrow = narrowHost(host);
  const rowH = narrow ? 22 : 26, padT = 10, padB = 34;
  const padL = narrow ? 104 : 184, padR = narrow ? 46 : 62;
  const W = narrow ? 350 : 760, H = padT + padB + rows.length * rowH;
  const pw = W - padL - padR;
  const hi = domainMax || Math.max(...rows.map(pick), 1);
  const X = v => (v / hi) * pw;

  // Axis ticks drop a trailing .0 (600, not 600.0); the value beside each bar
  // keeps its decimal so a column of them lines up.
  const fmtAxis = v => String(+v.toFixed(2));
  let s = '';
  ticks(0, hi, 4).forEach(v => {
    s += `<line class="grid-line" x1="${padL + X(v)}" y1="${padT}" x2="${padL + X(v)}" y2="${H - padB + 2}"/>`;
    s += `<text class="axis-text" x="${padL + X(v)}" y="${H - padB + 18}" text-anchor="middle">${fmtAxis(v)}</text>`;
  });

  rows.forEach((r, i) => {
    const y = padT + i * rowH;
    const w = Math.max(X(pick(r)), 1);
    // 2px gap between bars, 4px rounded data-end, anchored to the baseline.
    s += `<rect class="mark" data-id="${r.id}" x="${padL}" y="${y + 2}" width="${w}" height="${rowH - 4}" rx="4" fill="${colorFor ? colorFor(r) : color}"/>`;
    s += `<text class="axis-text" x="${padL - 10}" y="${y + rowH / 2 + 4}" text-anchor="end">${esc(narrow ? shortTeam(r.name) : r.name)}</text>`;
    s += `<text class="axis-text" x="${padL + w + 8}" y="${y + rowH / 2 + 4}">${fmtVal(pick(r))}${narrow ? '' : esc(note(r))}</text>`;
  });

  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img"
    aria-label="Teams ranked, longest bar first">${s}</svg>`;
  wireTeamMarks(host, rows);
}

function wireTeamMarks(host, rows) {
  const index = new Map(rows.map(r => [r.id, r]));
  const svg = host.querySelector('svg');
  svg.addEventListener('pointermove', e => {
    const m = e.target.closest('[data-id]');
    if (!m) { hideTip(); return; }
    const r = index.get(m.dataset.id);
    if (r) showTip(e, teamTip(r));
  });
  svg.addEventListener('pointerleave', hideTip);
}

/* Spend against return: the chart that makes an underspend obvious. */
function teamScatter(host, rows, opts = {}) {
  const { exclude = [] } = opts;
  const shown = rows.filter(r => !exclude.includes(r.id));
  const narrow = narrowHost(host);
  const W = narrow ? 350 : 760, H = narrow ? 320 : 420;
  const padL = narrow ? 44 : 54, padR = narrow ? 14 : 20, padT = 16, padB = narrow ? 46 : 50;
  const pw = W - padL - padR, ph = H - padT - padB;

  // The x axis is fitted to the teams shown rather than anchored at $0. With
  // the far outlier dropped nothing sits below $80, and holding the axis at
  // zero would spend two thirds of the width on empty space -- which is the
  // readability problem the exclusion is meant to solve. Truncating is fine on
  // a scatter (unlike a bar, whose length encodes the value from zero); the
  // axis title says where it starts.
  const minCost = Math.min(...shown.map(r => r.cost));
  const loX = Math.max(0, Math.floor((minCost - 5) / 10) * 10);
  const hiX = BUDGET;
  const yt = ticks(0, Math.max(...shown.map(r => r.pts)));
  const hiY = Math.max(...shown.map(r => r.pts), yt[yt.length - 1]);
  const X = v => padL + ((v - loX) / (hiX - loX)) * pw;
  const Y = v => padT + ph - (v / hiY) * ph;

  let s = '';
  yt.forEach(v => {
    s += `<line class="grid-line" x1="${padL}" y1="${Y(v)}" x2="${W - padR}" y2="${Y(v)}"/>`;
    s += `<text class="axis-text" x="${padL - 8}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  });
  ticks(loX, hiX, 5).forEach(v => {
    if (v < loX) return;
    s += `<text class="axis-text" x="${X(v)}" y="${H - 28}" text-anchor="middle">$${v}</text>`;
  });
  s += `<text class="axis-title" x="${padL + pw / 2}" y="${H - 8}" text-anchor="middle">Auction dollars spent (axis starts at $${loX} of a $${BUDGET} budget)</text>`;
  s += `<text class="axis-title" transform="translate(15,${padT + ph / 2}) rotate(-90)" text-anchor="middle">Points from the eight picks</text>`;

  shown.forEach(r => {
    s += `<circle class="mark" data-id="${r.id}" cx="${X(r.cost)}" cy="${Y(r.pts)}" r="6"
      fill="${r.out ? 'var(--text-muted)' : 'var(--pos-qb)'}"/>`;
  });
  // Selective labels. Fifteen of nineteen teams spent $186-200, so naming them
  // all just stacks text down the right-hand edge; these are the ones the chart
  // is actually about. The rest are named on hover and in the table.
  const notable = new Set([
    ...shown.slice(0, 3).map(r => r.id),
    ...shown.slice(-3).map(r => r.id),
    ...shown.filter(r => r.unspent >= 20).map(r => r.id),
  ]);
  shown.filter(r => notable.has(r.id)).forEach(r => {
    const right = X(r.cost) < padL + pw * 0.72;
    s += `<text class="mark-label" x="${X(r.cost) + (right ? 10 : -10)}" y="${Y(r.pts) + 4}"
      text-anchor="${right ? 'start' : 'end'}">${esc(narrow ? shortTeam(r.name) : r.name)}</text>`;
  });

  // Say what was left off, rather than dropping it silently.
  const dropped = rows.filter(r => exclude.includes(r.id));
  const note = dropped.length
    ? `<p class="cap" style="margin-top:8px">Off the chart: ${dropped.map(r =>
        `${esc(r.name)} (${money(r.cost)}, ${fmt1(r.pts)} pts)`).join(', ')} &mdash; too far left to plot
        without squashing everyone else. Still in the ranking and the table above and below.</p>`
    : '';
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img"
    aria-label="Dollars spent against points returned, one dot per team">${s}</svg>${note}`;
  deCollide(host.querySelector('svg'));
  wireTeamMarks(host, shown);
}

/* Where each team's money went. Stacked, so adjacent-pair colour rules apply. */
function teamAllocation(host, rows) {
  const narrow = narrowHost(host);
  const rowH = narrow ? 21 : 24, padT = 10, padB = 34;
  const padL = narrow ? 104 : 184, padR = narrow ? 14 : 20;
  const W = narrow ? 350 : 760, H = padT + padB + rows.length * rowH;
  const pw = W - padL - padR;
  const hi = Math.max(...rows.map(r => r.cost), 1);

  let s = '';
  ticks(0, hi, 4).forEach(v => {
    s += `<line class="grid-line" x1="${padL + (v / hi) * pw}" y1="${padT}" x2="${padL + (v / hi) * pw}" y2="${H - padB + 2}"/>`;
    s += `<text class="axis-text" x="${padL + (v / hi) * pw}" y="${H - padB + 18}" text-anchor="middle">$${v}</text>`;
  });

  rows.forEach((r, i) => {
    const y = padT + i * rowH;
    let x = padL;
    POS_ORDER.forEach(p => {
      const w = (r.pos[p] / hi) * pw;
      if (w > 0) {
        // 2px surface gap between segments keeps the boundary readable.
        s += `<rect class="mark" data-id="${r.id}" x="${x}" y="${y + 2}" width="${Math.max(w - 2, 1)}"
          height="${rowH - 4}" rx="2" fill="${POS_COLOR[p]}"><title>${esc(r.name)} — ${p} ${money(r.pos[p])}</title></rect>`;
      }
      x += w;
    });
    s += `<text class="axis-text" x="${padL - 10}" y="${y + rowH / 2 + 4}" text-anchor="end">${esc(narrow ? shortTeam(r.name) : r.name)}</text>`;
  });

  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img"
    aria-label="How each team split its auction budget across positions">${s}</svg>
    <div class="legend">${POS_ORDER.map(p =>
      `<span><span class="sw" style="background:${POS_COLOR[p]}"></span>${p}</span>`).join('')}</div>`;
}

/* ---------- page ---------- */
function renderTeams() {
  const rows = teamRows();
  const best = rows[0], worst = rows[rows.length - 1];
  const byEff = [...rows].sort((a, b) => b.perSpent - a.perSpent);
  const under = [...rows].sort((a, b) => b.unspent - a.unspent)[0];
  const avg = rows.reduce((s, r) => s + r.pts, 0) / rows.length;

  // Keep the lone extreme off the scatter: at under half the next-lowest spend
  // it pins the whole field against the right-hand edge. A rule rather than a
  // hardcoded name, so it stops applying if spending ever evens out.
  const bySpend = [...rows].sort((a, b) => a.cost - b.cost);
  const offChart = (bySpend.length > 1 && bySpend[0].cost < bySpend[1].cost / 2)
    ? [bySpend[0].id] : [];

  document.getElementById('app').innerHTML = `
  <header class="page">
    <div class="eyebrow">Andrew's Acquaintances &middot; midseason review &middot; through week ${REVIEW.through}</div>
    <h1>Which teams drafted best</h1>
    <p>All nineteen teams had the same ${money(BUDGET)} and took eight players each. This ranks them by
    what those eight have actually produced &mdash; most to least value out of the draft.</p>
  </header>
  ${nav('teams.html')}

  <div class="tiles">
    <div class="tile"><div class="label">Best draft</div><div class="value">${esc(best.name)}</div>
      <div class="note">${fmt1(best.pts)} pts from ${money(best.cost)}</div></div>
    <div class="tile"><div class="label">Worst draft</div><div class="value">${esc(worst.name)}</div>
      <div class="note">${fmt1(worst.pts)} pts from ${money(worst.cost)}</div></div>
    <div class="tile"><div class="label">League average</div><div class="value">${fmt1(avg)}</div>
      <div class="note">points per team from eight picks</div></div>
    <div class="tile"><div class="label">Biggest underspend</div><div class="value">${money(under.unspent)}</div>
      <div class="note">${esc(under.name)} left it on the table</div></div>
  </div>

  <section>
    <h2>The ranking</h2>
    <p class="sub">Points produced by each team's eight drafted players. Every team started from the same
    ${money(BUDGET)}, so this is the like-for-like comparison. Greyed bars are teams already eliminated &mdash;
    their picks kept scoring for whoever claimed them, which is what the draft bought regardless.</p>
    <div class="card"><div id="rank"></div></div>
  </section>

  <section>
    <h2>Squad quality</h2>
    <p class="sub">Where each team's eight picks rank at their own positions, with no money in it at all
    &mdash; just how good the players turned out to be. Each pick scores 100 if he is the best player
    drafted at his position and 0 if he is the worst, and the bar is the team's average, so
    <strong>longer is better</strong>. The axis runs to a full 100: nobody is close, because nobody drafts
    the top player at every slot.</p>
    <p class="sub">Normalised by pool size on purpose. ${byPos('TE').length} tight ends were drafted
    against ${byPos('WR').length} receivers, so a raw rank of 15 is mid-pack at one position and nearly
    last at the other &mdash; adding raw ranks quietly rewards a tight-end-heavy roster. Hover a bar for
    every pick's rank and pool, plus the raw sum.</p>
    <div class="card"><div id="ranksum"></div></div>
  </section>

  <section>
    <h2>Spend against return</h2>
    <p class="sub">The useful caveat to any &ldquo;points per dollar&rdquo; table: unspent auction money buys
    nothing, because waivers run on a separate ${money(400)} pool. Sixteen of the nineteen spent between
    ${money(186)} and ${money(200)}, so the real story is how little the spending varied &mdash; almost all
    of the difference between these teams is <em>who</em> they bought, not how much they laid out. Grey dots
    are eliminated teams.</p>
    <div class="card"><div id="scatter"></div></div>
  </section>

  <section>
    <h2>Points per dollar actually spent</h2>
    <p class="sub">Efficiency on the money that was used. Read it alongside the chart above, not on its
    own: it rewards <em>not</em> spending, which is why ${esc(under.name)} tops it on
    ${money(under.cost)} while finishing ${rows.indexOf(under) + 1}th on production.</p>
    <div class="card"><div id="eff"></div></div>
  </section>

  <section>
    <h2>Where the money went</h2>
    <p class="sub">Each team's ${money(BUDGET)} split across positions, in the ranking order above. Hover a
    segment for the figure.</p>
    <div class="card"><div id="alloc"></div></div>
  </section>

  <section>
    <h2>Full table</h2>
    <p class="sub">Click any heading to re-sort.</p>
    <div class="tablewrap" id="table"></div>
  </section>
  ${footer()}`;

  const drawCharts = () => {
    teamBars(document.getElementById('rank'), rows, r => r.pts, {
      colorFor: r => r.out ? 'var(--text-muted)' : 'var(--pos-qb)',
      fmtVal: fmt1, note: r => r.out ? `  (out wk ${r.out})` : ''
    });
    // Best squad first, and the axis runs to a full 100 rather than to the
    // leader, so the bars show how far short of a perfect draft everyone fell.
    teamBars(document.getElementById('ranksum'), [...rows].sort((a, b) => b.squadPct - a.squadPct),
      r => r.squadPct, { color: 'var(--accent)', fmtVal: fmt1, domainMax: 100 });
    teamScatter(document.getElementById('scatter'), rows, { exclude: offChart });
    teamBars(document.getElementById('eff'), byEff, r => r.perSpent, {
      color: 'var(--pos-wr)', fmtVal: fmt2, note: r => `  (${money(r.cost)})`
    });
    teamAllocation(document.getElementById('alloc'), rows);
  };
  drawCharts();
  teamTable(document.getElementById('table'), rows);

  // Re-pick the layout when the width crosses the narrow threshold, so rotating
  // a phone doesn't leave 4px axis type behind.
  let t;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(drawCharts, 150); });
}

const TEAM_COLS = [
  { k: 'rank', h: '#', num: true, cell: (r, i) => i + 1 },
  { k: 'name', h: 'Team', cell: r => `<span class="who">${esc(r.name)}</span>${r.out ? `<br><span class="meta">out in week ${r.out}</span>` : ''}` },
  { k: 'cost', h: 'Spent', num: true, cell: r => money(r.cost) },
  { k: 'unspent', h: 'Unspent', num: true, cell: r => r.unspent ? money(r.unspent) : '—' },
  { k: 'pts', h: 'Points', num: true, cell: r => fmt1(r.pts) },
  { k: 'perSpent', h: 'Pts / $ spent', num: true, cell: r => fmt2(r.perSpent) },
  { k: 'perBudget', h: 'Pts / $ budget', num: true, cell: r => fmt2(r.perBudget) },
  { k: 'squadPct', h: 'Squad score', num: true, cell: r => fmt1(r.squadPct) },
  { k: 'rankSum', h: 'Raw rank sum', num: true, cell: r => r.rankSum },
  { k: 'beat', h: 'Picks beating price', num: true, cell: r => `${r.beat} of ${r.n}` },
  { k: 'delta', h: 'Net places', num: true, cell: r => `<span class="${r.delta > 0 ? 'delta-pos' : r.delta < 0 ? 'delta-neg' : ''}">${r.delta > 0 ? '+' : ''}${r.delta}</span>` },
];

function teamTable(host, rows) {
  let sortKey = 'pts', dir = -1;
  function draw() {
    const sorted = [...rows].sort((a, b) => {
      if (sortKey === 'rank') return (rows.indexOf(a) - rows.indexOf(b)) * -dir;
      const col = TEAM_COLS.find(c => c.k === sortKey);
      if (!col.num) return String(a[sortKey]).localeCompare(String(b[sortKey])) * dir;
      return ((a[sortKey] ?? -Infinity) - (b[sortKey] ?? -Infinity)) * dir;
    });
    host.innerHTML = `<table><thead><tr>${TEAM_COLS.map(c =>
      `<th data-k="${c.k}"${c.k === sortKey ? ` aria-sort="${dir === -1 ? 'descending' : 'ascending'}"` : ''}>${c.h}${
        c.k === sortKey ? ` <span class="arrow">${dir === -1 ? '▼' : '▲'}</span>` : ''}</th>`).join('')
      }</tr></thead><tbody>${sorted.map((r, i) =>
        `<tr>${TEAM_COLS.map(c => `<td>${c.cell(r, rows.indexOf(r))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    host.querySelectorAll('th').forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.k;
      if (k === sortKey) dir = -dir; else { sortKey = k; dir = -1; }
      draw();
    }));
  }
  draw();
}
