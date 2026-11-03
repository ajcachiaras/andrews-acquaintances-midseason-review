# Midseason draft review — Andrew's Acquaintances

What the 2026 auction actually bought, half a season in. One page for the league
as a whole and one for each position, ranking every drafted player by what he
has produced against what he cost.

Live at
**<https://ajcachiaras.github.io/andrews-acquaintances-midseason-review/>**

Companion to the [Guillotine Watch tracker](https://github.com/ajcachiaras/andrews-acquaintances-tracker).

## Pages

| Page | What's on it |
|---|---|
| `index.html` | League-wide: price-against-production for all four positions, the ten best and worst buys, and the top five drafts |
| `qb.html` / `rb.html` / `wr.html` / `te.html` | That position ranked, with the price/production scatter, the paid-as-playing-as bars, and a sortable table |
| `teams.html` | All nineteen teams ranked by what their eight picks produced, plus sum of positional ranks, spend-against-return, per-dollar efficiency, and how each team split its budget across positions |

Each positional page carries three views of the same players: a scatter of price
against points with that position's own market line, a diverging bar of places
gained or lost against price, and the full sortable table.

## How value is measured

Two numbers, because neither alone is honest.

**Points per dollar** is the obvious one and the one that flatters cheap
players — Jordan Love at $1 returns 154 points per dollar and always will. It's
in every table, but it isn't the headline.

**Price rank against production rank** is the headline: *drafted as the WR58,
playing as the WR6*. It carries no model and no assumption. A linear fit was
tried first and rejected — it claimed a $1 backup quarterback "should" have
scored 97 points, because most of the cheap quarterbacks in this draft were real
starters, so every unplayed backup looked like a catastrophe. Ranks say only what
happened.

The scatter's dashed line is a per-position least-squares fit of points against
price, kept as a *visual* market reference (above it is a profit, below it is
not) rather than as a per-player verdict.

### For teams

Teams are ranked by **total production from their eight picks**, not by points
per dollar. Every team had the same $200, and unspent auction money is
forfeited — waivers run on a separate $400 pool, so leftover bids carry nothing
forward. Ranking by per-dollar efficiency therefore rewards skipping the draft:
Max's team spent $30, tops the efficiency table at 11.89 pts/$, and finished
dead last on production having been eliminated in week 2.

Both numbers are on the page — the efficiency chart is there, with that caveat
stated beside it.

The spend-against-return scatter leaves off any team spending under half the
next-lowest, because one team at $30 against a field that mostly spent $186–200
pins everyone else against the right-hand edge. The excluded team is named under
the chart with its figures, and is still in the ranking, the tiles and the table.
It's a rule rather than a hardcoded name, so it stops applying if spending ever
evens out. The scatter's x axis is fitted to the teams shown rather than anchored
at $0 for the same reason, and its title says where it starts; the y axis stays
at zero, since points are a magnitude and the baseline is meaningful.

**Sum of positional ranks** is a money-free view of the same squads: add up where
each of a team's eight picks ranks at his own position (QB4 + RB19 + WR27 + …).
Lower is better. It deliberately ignores price entirely — it answers "how good
are these eight players", not "were they worth it".

Its one unavoidable flaw is pool size: 19 tight ends were drafted against 60
receivers, so a TE can't rank worse than 19th while a receiver can rank 60th, and
a TE-heavy roster flatters itself. Each team's average positional percentile is in
the tooltip as the corrected version. The two orderings mostly agree — same first
place, same bottom two, and all but one team within three places — the exception
being Qadry Ismail's Womb, which took three tight ends and two quarterbacks and
drops from 6th to 15th once pool size is accounted for.

Draft value and survival are deliberately separate: Russini's Side Piece has the
best draft on production and was eliminated in week 8. A cut team's players
keep scoring for whoever claimed them, which is still what the draft bought.

## What counts

- **Prices** are the 2026 auction: $3,397 across 152 players, $200 per team.
- **Points** are each player's real production in the weeks counted, scored under
  this league's own settings — 0.5 PPR, 4-point passing TDs, 0.25 TE reception
  bonus — not a generic half-PPR number. The scoring function was checked twice:
  against Sleeper's actual stats for a finished week it reproduces every real
  player score to the cent, and against the tracker's independently captured
  lineups it agrees on all 917 player-weeks.
- **Production counts wherever the player played**, including after the team that
  drafted him was eliminated. This measures what the money bought, not what each
  manager kept — which matters in a guillotine league, where a cut team's roster
  is redistributed.

## Rebuilding it

```bash
python build_data.py
```

Rewrites `data.js` from Sleeper: the auction, every finished week's stats, and
the derived ranks. Standard library only, no auth, no packages. A finished
week's stats never change, so they're cached in `.cache/` (gitignored).

Unlike the tracker, this is a **snapshot** rather than a running record — it is
rebuilt wholesale and is meant to be regenerated deliberately, at a point in the
season worth marking. The tracker's hard lesson applies here too: Sleeper
reshapes a past week's lineups when the league's roster settings change. That
does not affect these numbers, because they come from per-player stat lines
rather than from team lineups.

## Colour

Charts use a CVD-validated categorical palette — blue/orange/aqua/yellow for
QB/RB/WR/TE, and a blue↔red diverging pair for over- and under-performance.
Light and dark are separately chosen steps from the same ramps, not a flip. The
four position hues were run through the palette validator in both modes and pass
every gate; in light mode aqua and yellow fall below 3:1 against the surface, so
every chart is accompanied by the full data table, which is the required relief.
Position is never carried by colour alone — every panel and page is titled, and
each chip in the nav pairs its swatch with the position name.
