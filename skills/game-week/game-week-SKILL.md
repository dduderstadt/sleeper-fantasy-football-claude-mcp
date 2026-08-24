---
name: game-week
description: Use whenever the user asks for a weekly fantasy football check-in during the season — e.g. "game week", "how's my team looking this week", "who should I start", "any good waiver pickups", "should I make a trade". Gives a quick default overview (start/sit, bye-week and injury replacements, waiver targets, trade and drop/add flags) and expands into full depth on follow-up questions about any specific area.
---

# Game Week

## When to use this

Trigger this for in-season, recurring questions like:
- "Game week" / "Game week check-in"
- "How's my team looking this week?"
- "Who should I start?"
- "Any good waiver pickups?"
- "Should I make a trade?" / "who should I trade for?" / "should I accept this trade?"
- "Should I drop anyone?"

Do NOT trigger this during a live draft (that's `draft-round-advice` / `draft-grade`).

## Overall shape: quick by default, deep on request

The default response is a **high-level overview** — brief, scannable, covering every category below in one or two lines each. Don't do the full deep-dive work (detailed trade construction, exhaustive drop/add comparison, multi-source value debates) unless the user follows up asking about a specific area. When they do follow up, use the matching deep-dive steps further down — full reasoning, not a one-liner.

## Steps for the default overview

1. **Gather data:**
   - `get_rosters` (the user's own roster, and the full league's rosters — the latter is needed later for trade reasoning even if not used in the overview itself)
   - `roster_needs`
   - `get_matchups` for the current week (get the current week from `get_nfl_state` if not already known)
   - `get_trending` for adds, limit=25, default 24-hour lookback
   - `get_watchlist`
   - `get_recent_performance` for every player on the user's roster (starters and bench), covering up to the last 4 completed weeks — this is what powers the utilization/performance check in step 2a below
   - A season bye-week schedule via web search (e.g. "[current season] NFL team bye weeks") — this is a static, once-a-season lookup, not something that needs re-searching every check-in if already found earlier in the conversation

2. **Start/sit, including bye-week and injury awareness:**
   - **Absolute rule: a player on bye this week must NEVER be recommended or left in a starting slot, no exceptions.** Cross-reference every starter's NFL team against the bye-week schedule before anything else. If a current starter is on bye, that's an automatic swap-out — call it out explicitly and say who should replace them, don't just mention it in passing.
   - Flag any starter who is questionable/doubtful/out.
   - For any starting slot left empty by a bye or injury with no viable same-position bench replacement, this is a real gap — briefly name 1-3 realistic fill options (waiver or roster-internal) even in the default overview, since an unfillable starting slot is a "must fix," not optional detail.
   - Note if a healthy bench player clearly outperforms a struggling starter's matchup, but keep it brief — one line.
   - If everything is clean, say so plainly rather than manufacturing a decision.

2a. **Performance/utilization trend check** (using `get_recent_performance`), covering the whole roster:
   - **Starters**: look at each starter's last up to 4 completed weeks of points and usage indicators (targets, carries, snap share). If a starter's role is clearly shrinking (usage trending down across those weeks) or their scoring has been consistently weak relative to what's expected of a starting-caliber player at that position, flag it as worth reviewing — don't wait for them to be flagged only via injury/bye. When flagged, name 2-3 realistic replacement options (roster-internal bench or waivers) the same way as the bye/injury gap logic above.
   - **Bench**: look for the reverse signal — a bench player whose usage or scoring has been trending up over the same window, suggesting a bigger role than their roster spot reflects. Flag these too, since they may be worth starting or at least watching closely.
   - Treat a bye week within the lookback window as excluded data, not a bad week — don't let a bye's zero drag down a trend read.
   - Skip this check entirely for players without enough game history yet (rookies, very recent adds) rather than drawing a conclusion from too little data.
   - Keep this to one or two lines per flagged player in the overview — this is a flag to prompt your own review, not a full analysis. If nothing stands out either direction, say so briefly rather than forcing a flag.

3. **Waiver targets** — same as before: filter the trending list through `roster_needs`'s weak spots, surface 1-3 realistic pickups, reasoning about current role/matchup/health rather than a fixed stat cutoff. Say plainly if nothing fits.

4. **Trade opportunity flag** — one line only in the overview. If `roster_needs` shows a clear weakness and the user's own roster shows a clear surplus elsewhere, flag that a trade could help (e.g. "worth exploring: you're deep at WR, thin at RB — a trade could help"). Do NOT construct an actual offer or name a trade target team in the overview — that's the deep-dive, on request only.

5. **Drop/add flag** — one line only. If a bench player looks clearly outclassed by someone available on waivers at the same position, flag it briefly (e.g. "Player X might be worth dropping for a stronger option on waivers"). Don't do the full comparison here — that's the deep-dive.

6. **Respond in a compact, scannable format:**

   ```
   Start/Sit:
   [1-3 lines — specific swaps with a short reason, bye/injury-driven
   moves called out explicitly, or "no changes needed" if clean]

   Needs replacing (bye/injury gaps with no roster answer):
   [Player/slot] — [1-3 replacement names] [omit if nothing applies]

   Performance flags:
   [1-2 lines per flagged player — underused/underperforming starters
   worth reviewing, with 2-3 replacement options; bench players
   trending up worth watching. Omit if nothing stands out.]

   Waiver targets:
   - [Player] — [position] — [why]

   Trade worth exploring: [one line, or omit if nothing stands out]
   Possible drop/add: [one line, or omit if nothing stands out]
   ```

7. **Keep the overview short.** This is meant to be scanned in a few seconds — one-liners, not paragraphs. The depth lives in the on-request steps below, not here.

## Deep dive: constructing a trade offer (on request)

Trigger when the user asks something like "what trade should I make," "who should I target for [position]," "help me put together a trade."

1. Call `get_rosters` for the full league (not just the user) and `get_league_users` for team names.
2. Identify the user's clearest need (from `roster_needs`) and clearest surplus (bench depth beyond what's needed at a position).
3. For other teams, reason about apparent surplus/need from their roster composition against the league's roster requirements (e.g. a team with 4 startable RBs and only 2 RB-eligible slots is plausibly deep at RB) — this is inference from roster shape, not confirmed team intent, so frame it as a reasonable guess, not certainty.
4. Propose 1-3 realistic trade ideas: what the user would offer, who they'd target, and which team seems like a plausible partner based on that reasoning. Keep each proposal concrete (specific players, not just positions).
5. Be upfront about the limitation: this is based on roster composition, not any team's actual willingness or strategy — it's a reasonable starting point for outreach, not a guaranteed accepted deal.

## Deep dive: evaluating a trade offer (on request)

Trigger when the user asks something like "should I accept this trade," "evaluate this trade," or similar.

1. First, check `get_transactions` for a pending trade involving the user's roster. If found, use those details.
2. If nothing relevant turns up in Sleeper's data, ask the user to describe the offer directly (which players each side gives).
3. Evaluate on: value balance (web search for current rankings/consensus on the players involved), roster fit for the user post-trade (does it address `roster_needs`'s actual weak spots, or create a new one), and bye-week/injury context on the incoming players.
4. Give a clear recommendation — accept, decline, or counter — with the reasoning spelled out. This can be a real paragraph; there's no draft clock here.

## Deep dive: drop/add analysis (on request)

Trigger when the user asks something like "should I drop anyone," "who should I cut," "compare my bench to waivers."

1. Compare the roster's weaker bench pieces (not just positions `roster_needs` flags as "weak," but genuinely mediocre depth anywhere on the roster) against the best available free agents at the same or a flex-eligible position.
2. Suggest specific drop-for-add pairs only where there's a real, current-context upgrade (role, opportunity, matchup outlook) — not just a marginal name-recognition difference.
3. If nothing on the roster is actually worth dropping, say so plainly.

## Notes

- **A bye-week player in a starting slot is the single thing this skill exists to prevent above all else.** Never let it slide by unmentioned, never soften it as optional, and never let matchup quality or "they usually play well" reasoning override it — bye week means zero real games, zero real points, full stop.
- Don't use a fixed statistical cutoff (e.g. "PPG under some number = weak") anywhere in this skill — matchups, roles, and injury context shift week to week, so reason about current relevance directly.
- Trade suggestions (both directions) are a real capability here, unlike in `draft-grade`, where they're intentionally out of scope — don't get confused between the two skills' rules.
- This skill is casual in its default form by design — the overview should read like a quick, useful glance, not a report. Depth is available, but only when asked for.
