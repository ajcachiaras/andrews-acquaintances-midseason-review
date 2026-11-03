/* Page renderers. Depends on review.js (charts, table, chrome) and data.js. */

/* ---------- one position ---------- */
function renderPosition(pos) {
  const players = byPos(pos);
  const best = players.reduce((m, p) => p.rankDelta > m.rankDelta ? p : m, players[0]);
  const worst = players.reduce((m, p) => p.rankDelta < m.rankDelta ? p : m, players[0]);
  const paid = players.reduce((s, p) => s + p.cost, 0);
  const priced = players.filter(p => p.ppd != null);
  const bestPpd = priced.reduce((m, p) => p.ppd > m.ppd ? p : m, priced[0]);

  document.title = POS_NAME[pos] + ' — Midseason draft review';
  document.getElementById('app').innerHTML = `
  <header class="page">
    <div class="eyebrow">Andrew's Acquaintances &middot; midseason review &middot; through week ${REVIEW.through}</div>
    <h1>${POS_NAME[pos]}</h1>
    <p>Every ${pos} bought in the ${money(REVIEW.spent)} auction, ranked by what he has actually
    produced &mdash; and measured against what he cost.</p>
  </header>
  ${nav(pos.toLowerCase() + '.html')}

  <div class="tiles">
    <div class="tile"><div class="label">${pos}s drafted</div><div class="value">${players.length}</div>
      <div class="note">for ${money(paid)} of the ${money(REVIEW.spent)} spent</div></div>
    <div class="tile"><div class="label">Best return</div><div class="value">${esc(best.name)}</div>
      <div class="note">$${best.cost} &middot; paid as ${pos}${best.costRank}, playing as ${pos}${best.ptsRank}</div></div>
    <div class="tile"><div class="label">Worst return</div><div class="value">${esc(worst.name)}</div>
      <div class="note">$${worst.cost} &middot; paid as ${pos}${worst.costRank}, playing as ${pos}${worst.ptsRank}</div></div>
    <div class="tile"><div class="label">Most points per dollar</div><div class="value">${fmt1(bestPpd.ppd)}</div>
      <div class="note">${esc(bestPpd.name)} &mdash; ${fmt1(bestPpd.pts)} pts at $${bestPpd.cost}</div></div>
  </div>

  <section>
    <h2>What the money bought</h2>
    <p class="sub">Each dot is one ${pos}. The dashed line is what this position's prices bought on
    average, so anyone above it has outscored his price and anyone below has not. Hover for detail;
    the six biggest movers are named.</p>
    <div class="card"><div id="scatter"></div></div>
  </section>

  <section>
    <h2>Paid as, playing as</h2>
    <p class="sub">Production rank minus price rank. Blue to the right means he is outplaying what he
    cost; red to the left means he is not. The number is places gained or lost among the
    ${players.length} ${pos}s drafted.</p>
    <div class="card"><div id="bars"></div></div>
  </section>

  <section>
    <h2>Full ${pos} table</h2>
    <p class="sub">Sorted by points. Click any heading to re-sort.</p>
    <div class="tablewrap" id="table"></div>
  </section>
  ${footer()}`;

  scatter(document.getElementById('scatter'), players, { color: POS_COLOR[pos], label: true });
  rankBars(document.getElementById('bars'), players, pos);
  table(document.getElementById('table'), players, 'pts', -1);
}

/* ---------- overview ---------- */
function renderOverview() {
  const all = REVIEW.players;
  const priced = all.filter(p => p.ppd != null);
  const bestPpd = priced.reduce((m, p) => p.ppd > m.ppd ? p : m, priced[0]);
  const topScore = all.reduce((m, p) => p.pts > m.pts ? p : m, all[0]);
  const hits = [...all].sort((a, b) => b.rankDelta - a.rankDelta).slice(0, 10);
  const misses = [...all].sort((a, b) => a.rankDelta - b.rankDelta).slice(0, 10);

  // Draft efficiency per team: what each manager's auction dollars returned.
  const teams = {};
  all.forEach(p => {
    const t = teams[p.by] || (teams[p.by] = { id: p.by, cost: 0, pts: 0, n: 0 });
    t.cost += p.cost; t.pts += p.pts; t.n += 1;
  });
  const teamRows = Object.values(teams)
    .map(t => ({ ...t, ppd: t.cost ? t.pts / t.cost : 0, out: REVIEW.eliminated[t.id] }))
    .sort((a, b) => b.ppd - a.ppd);

  const miniRow = p => `<tr>
    <td><span class="who">${esc(p.name)}</span><br><span class="meta">${p.pos} &middot; ${esc(teamName(p.by))}</span></td>
    <td>$${p.cost}</td><td>${fmt1(p.pts)}</td>
    <td><span class="chip">${p.pos}${p.costRank} &rarr; ${p.pos}${p.ptsRank}</span>
      <span class="${p.rankDelta > 0 ? 'delta-pos' : 'delta-neg'}">${p.rankDelta > 0 ? '+' : ''}${p.rankDelta}</span></td></tr>`;

  document.getElementById('app').innerHTML = `
  <header class="page">
    <div class="eyebrow">Andrew's Acquaintances &middot; 19-team guillotine &middot; 2026</div>
    <h1>Midseason draft review</h1>
    <p>What the ${money(REVIEW.spent)} auction actually bought, eight weeks in. Every drafted player's
    real production against the price paid for him &mdash; league-wide here, position by position
    on the other pages.</p>
  </header>
  ${nav('index.html')}

  <div class="tiles">
    <div class="tile"><div class="label">Spent at auction</div><div class="value">${money(REVIEW.spent)}</div>
      <div class="note">${all.length} players &middot; $${REVIEW.budget} budget per team</div></div>
    <div class="tile"><div class="label">Top scorer</div><div class="value">${esc(topScore.name)}</div>
      <div class="note">${fmt1(topScore.pts)} pts &middot; cost $${topScore.cost}</div></div>
    <div class="tile"><div class="label">Best points per dollar</div><div class="value">${fmt1(bestPpd.ppd)}</div>
      <div class="note">${esc(bestPpd.name)} at $${bestPpd.cost}</div></div>
    <div class="tile"><div class="label">Weeks counted</div><div class="value">1&ndash;${REVIEW.through}</div>
      <div class="note">pulled ${REVIEW.generated}</div></div>
  </div>

  <section>
    <h2>Price against production, by position</h2>
    <p class="sub">One panel per position, because a dollar buys different things at each. The dashed
    line is that position's own market: above it is a profit, below it is not. Hover any dot.</p>
    <div class="facets">
      ${POS_ORDER.map(p => `<div class="card">
        <h3><span class="swatch" style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${POS_COLOR[p]}"></span>
          ${POS_NAME[p]}</h3>
        <p class="cap">${byPos(p).length} drafted &middot; ${money(byPos(p).reduce((s, x) => s + x.cost, 0))} spent</p>
        <div id="f-${p}"></div></div>`).join('')}
    </div>
  </section>

  <section>
    <h2>The ten best buys</h2>
    <p class="sub">Biggest gain between what a player cost and where he now ranks at his position.</p>
    <div class="tablewrap"><table><thead><tr><th>Player</th><th>Price</th><th>Points</th><th>Price &rarr; play</th></tr></thead>
      <tbody>${hits.map(miniRow).join('')}</tbody></table></div>
  </section>

  <section>
    <h2>The ten worst</h2>
    <p class="sub">The same measure, the other way.</p>
    <div class="tablewrap"><table><thead><tr><th>Player</th><th>Price</th><th>Points</th><th>Price &rarr; play</th></tr></thead>
      <tbody>${misses.map(miniRow).join('')}</tbody></table></div>
  </section>

  <section>
    <h2>Draft efficiency by team</h2>
    <p class="sub">Total production from a team's drafted players against the dollars it spent on them.
    Eliminated teams are marked &mdash; their players kept scoring for whoever picked them up.</p>
    <div class="tablewrap"><table><thead><tr><th>#</th><th>Team</th><th>Spent</th><th>Players</th><th>Points</th><th>Pts / $</th></tr></thead>
      <tbody>${teamRows.map((t, i) => `<tr>
        <td>${i + 1}</td>
        <td><span class="who">${esc(teamName(t.id))}</span>${t.out ? `<br><span class="meta">out in week ${t.out}</span>` : ''}</td>
        <td>$${t.cost}</td><td>${t.n}</td><td>${fmt1(t.pts)}</td><td>${fmt2(t.ppd)}</td></tr>`).join('')}
      </tbody></table></div>
  </section>
  ${footer()}`;

  POS_ORDER.forEach(p => scatter(document.getElementById('f-' + p), byPos(p),
    { color: POS_COLOR[p], compact: true }));
}
