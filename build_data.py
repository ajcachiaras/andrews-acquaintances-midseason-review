#!/usr/bin/env python3
"""Build data.js for the midseason draft-value review.

Pulls the auction draft and every week's actual stats from Sleeper, scores them
under this league's own settings, and writes what each dollar bought.

    python build_data.py

Standard library only. Weekly stats for a finished week are cached in .cache/.
"""

import json
import re
import statistics
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

LEAGUE_ID = "1357848429371338752"
API = "https://api.sleeper.app/v1"
ROOT = Path(__file__).resolve().parent
CACHE = ROOT / ".cache"
OUT = ROOT / "data.js"

# Team names as the tracker spells them -- hand-curated, and different from
# Sleeper's own strings (curly apostrophes, casing).
TRACKER_DATA = ROOT.parent / "andrews-acquaintances-tracker" / "data.js"


def log(m):
    print(m, flush=True)


def get(path, attempts=4):
    url = API + path
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "midseason-review/1.0"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            if i == attempts - 1:
                raise SystemExit("FAILED %s: %s" % (url, e))
            time.sleep(2 ** i)


def cached(name, build):
    CACHE.mkdir(exist_ok=True)
    f = CACHE / name
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    val = build()
    f.write_text(json.dumps(val), encoding="utf-8")
    return val


def score_line(stats, scoring):
    """Points for a stat line under this league's scoring. The same function
    reproduced all 156 of a finished week's real player scores to the cent."""
    return sum(scoring.get(k, 0) * v for k, v in stats.items() if isinstance(v, (int, float)))


def tracker_team_names():
    if not TRACKER_DATA.exists():
        return {}
    text = TRACKER_DATA.read_text(encoding="utf-8")
    body = re.search(r"teams:\s*\{(.*?)\n  \}", text, re.S)
    if not body:
        return {}
    return dict(re.findall(r'"(\d+)":\s*"((?:[^"\\]|\\.)*)"', body.group(1)))


def tracker_eliminations():
    if not TRACKER_DATA.exists():
        return {}
    text = TRACKER_DATA.read_text(encoding="utf-8")
    m = re.search(r"eliminated:\s*\{([^}]*)\}", text)
    return {t: int(w) for t, w in re.findall(r'"(\d+)":\s*(\d+)', m.group(1))} if m else {}


def main():
    state = get("/state/nfl")
    season = state["season"]
    through = int(state["week"]) - 1          # last finished week
    weeks = list(range(1, through + 1))
    log("season %s, scoring weeks 1-%d" % (season, through))

    league = get("/league/%s" % LEAGUE_ID)
    scoring = league["scoring_settings"]

    names = tracker_team_names()
    elim = tracker_eliminations()
    teams = {str(t["roster_id"]): names.get(str(t["roster_id"])) or t.get("metadata", {}).get(
        "team_name") or ("Roster %s" % t["roster_id"]) for t in get("/league/%s/rosters" % LEAGUE_ID)}

    draft = get("/league/%s/drafts" % LEAGUE_ID)[0]
    budget = (draft.get("settings") or {}).get("budget")   # per-team auction budget
    picks = get("/draft/%s/picks" % draft["draft_id"])
    log("draft: %d picks, $%d spent" % (
        len(picks), sum(int(p["metadata"].get("amount") or 0) for p in picks)))

    # Weekly actual stats, scored. A finished week never changes, so cache it.
    week_pts = {}
    for w in weeks:
        raw = cached("stats-%s-%d.json" % (season, w), lambda w=w: get(
            "/stats/nfl/regular/%s/%d" % (season, w)))
        week_pts[w] = {pid: round(score_line(s, scoring), 2)
                       for pid, s in raw.items() if isinstance(s, dict)}
        log("  week %d: %d players with a stat line" % (w, len(week_pts[w])))

    players = []
    for p in picks:
        pid = str(p["player_id"])
        md = p.get("metadata") or {}
        name = (" ".join(x for x in (md.get("first_name"), md.get("last_name")) if x)).strip()
        cost = int(md.get("amount") or 0)
        by_week = [week_pts[w].get(pid) for w in weeks]
        scored = [v for v in by_week if v is not None]
        total = round(sum(scored), 2)
        gp = sum(1 for v in scored if v != 0)
        players.append({
            "id": pid,
            "name": name or pid,
            "pos": md.get("position") or "?",
            "nfl": md.get("team") or "FA",
            "cost": cost,
            "by": str(p["roster_id"]),
            "pts": total,
            "gp": gp,
            "ppg": round(total / gp, 2) if gp else 0.0,
            "weeks": [None if v is None else round(v, 2) for v in by_week],
        })

    # Expected points for a price, fitted per position. Points-per-dollar alone
    # always crowns the cheapest body on the board, so the headline number is
    # surplus against what that position's market actually paid for production.
    for pos in sorted({p["pos"] for p in players}):
        group = [p for p in players if p["pos"] == pos]
        if len(group) < 4:
            for p in group:
                p["exp"] = None
                p["surplus"] = None
            continue
        xs = [p["cost"] for p in group]
        ys = [p["pts"] for p in group]
        mx, my = statistics.fmean(xs), statistics.fmean(ys)
        var = sum((x - mx) ** 2 for x in xs)
        slope = (sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / var) if var else 0.0
        intercept = my - slope * mx
        for p in group:
            exp = max(0.0, intercept + slope * p["cost"])
            p["exp"] = round(exp, 2)
            p["surplus"] = round(p["pts"] - exp, 2)
        log("  %-3s n=%2d  expected pts = %.2f + %.3f x $" % (pos, len(group), intercept, slope))

    # Rank within position by what he cost, and by what he actually produced.
    # This is the honest headline: a linear fit says a $1 backup QB "should"
    # have scored 97 points, because most cheap QBs in this draft were real
    # starters. Ranks carry no such assumption -- drafted as the QB18, playing
    # as the QB1 is a fact about the draft, not a model output.
    for pos in sorted({p["pos"] for p in players}):
        group = [p for p in players if p["pos"] == pos]
        for i, p in enumerate(sorted(group, key=lambda x: (-x["cost"], x["name"])), 1):
            p["costRank"] = i
        for i, p in enumerate(sorted(group, key=lambda x: (-x["pts"], x["name"])), 1):
            p["ptsRank"] = i
        for p in group:
            p["rankDelta"] = p["costRank"] - p["ptsRank"]
            p["posN"] = len(group)
            p["ppd"] = round(p["pts"] / p["cost"], 2) if p["cost"] else None

    players.sort(key=lambda p: -p["pts"])
    payload = {
        "season": season,
        "through": through,
        "weeks": weeks,
        "generated": date.today().isoformat(),
        "budget": budget,
        "spent": sum(p["cost"] for p in players),
        "teams": teams,
        "eliminated": elim,
        "players": players,
    }
    OUT.write_text(
        "// Generated by build_data.py from Sleeper. Do not edit by hand.\n"
        "const REVIEW = " + json.dumps(payload, indent=1, ensure_ascii=False) + ";\n",
        encoding="utf-8")
    log("wrote data.js -- %d players, %.0f KB" % (len(players), OUT.stat().st_size / 1024))


if __name__ == "__main__":
    main()
