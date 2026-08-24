---
name: draft-round-advice
description: Use whenever the user asks for fantasy football draft help during a live Sleeper draft — e.g. "what should I draft this round", "I'm on the clock", "round X pick", or similar. Calls the Sleeper MCP server's draft_status tool, cross-references available players against current rankings via web search, and returns a consistent recommendation format: watchlist matches first, then top graded players at the position of need, then top options overall, then sleeper picks.
---

# Draft Round Advice

## When to use this

Trigger this whenever the user is actively drafting and asks something like:
- "What should I draft this round?"
- "I'm on the clock, pick X"
- "It's my pick in round X"
- "Who should I take?"
- "Round 6, what do I need?"

Also trigger on shorthand, since this is used live on mobile where fast typing matters more than full sentences. Treat any combination of a round-word ("rd", "round", "r") and/or a pick-word ("pk", "pick", "p") followed by a number, in any order, spacing, or punctuation, as a trigger — e.g. "rd1 pk23", "round 1 pick 23", "r1p23", "pk23", "rd4", "pick 6". This pattern is distinctive enough to trigger on its own, including as the very first message of a session — no prior "we're mid-draft" context is required for a well-formed round/pick shorthand. A bare number with no round/pick word attached (e.g. just "4") still requires established mid-draft context first, since a lone number alone is too ambiguous without it.

The shorthand can also include a position abbreviation (QB/RB/WR/TE/K/DEF, case-insensitive) — e.g. "rd1p4 wr", "r1p4wr", "pk23 rb". When a position is included, treat it as the user explicitly overriding step 2's automatic position selection: build the whole response around that specified position instead of auto-picking one. This is the mechanism for reacting to a run on a position — if WR is flying off the board, the user can force a WR-focused response regardless of what the baseline or roster needs would otherwise suggest. If more than one position is specified (e.g. "rd1p4 wr rb"), build the full four-section response for each position separately and present them side by side, clearly labeled by position — don't merge them into one mixed list. If the text after the round/pick doesn't match a recognizable position abbreviation, don't guess at what was meant — fall back to normal auto-selection (step 2's logic) and note briefly that the position wasn't recognized, so the user can just ask again if they meant something specific. Still surface a brief heads-up if the override conflicts with roster needs or the baseline (e.g. "your bigger need is RB, but here's WR since that's what you asked for") — inform, don't override the user's explicit choice. All other rules (round-appropriate filter, sleeper realism, dedupe, response format) still apply exactly the same to each specified position.

Outside of an active draft context, treat these same short phrases as ambiguous and ask for clarification rather than guessing — the shorthand-friendly interpretation only applies once it's clear from the conversation that a live draft is underway.

Do NOT trigger this for general season-long strategy questions, post-draft roster review, or waiver wire questions — those are separate contexts. Do NOT trigger this for grading a pick already made (that's `draft-grade`, e.g. "grade", "gr", "how'd that go") — when phrasing is genuinely ambiguous between the two, use tense as the disambiguator: forward-looking language about a pick not yet made ("what should I take," "who's good here," "what do I need") means this skill; backward-looking language about a pick already made ("how'd that go," "was that good," "how did I do") means `draft-grade`. If still unclear, ask rather than guessing.

## Preview / check-in mode

If the user is checking in ahead of their actual turn — asking something like "where do things stand," "what's coming up," "check in," or similar, rather than actively being on the clock — use a lighter response instead of the full four-section breakdown:

```
Next round: [round number] — [position(s) to prioritize, one-line reason]

Your watchlist:
- [available watchlist players in that position group, if any — round-appropriate filter still applies]

Best available at [position], if you need it:
- [Player 1] — [team/position] — [one-line reason]
- [Player 2] — [team/position] — [one-line reason]
- [Player 3] — [team/position] — [one-line reason]
```

This is intentionally more compact than the on-the-clock response — no separate "top graded at position of need" vs. "top options overall" split, no sleeper section — since this is for planning ahead, not an immediate decision. All the same underlying rules still apply (round-appropriate filter, injury tagging, dedupe with ⭐, drafted-player exclusion). Note briefly that the picture could shift before it's actually the user's turn, since other teams will still be picking in the meantime.

## Steps to follow every time

1. **Call `draft_status`** from the Sleeper MCP server using the current draft_id. This returns:
   - Picks made so far (with traded picks accounted for), plus a count of remaining undrafted players per position — not a full undrafted list
   - A `search_rank_reference` field: the top 5 remaining players per position sorted by Sleeper's search_rank. This is a rough signal only — search_rank is a general search-relevance field, not a curated fantasy ranking. Use it as a quick sanity check or starting point, never as the primary source for "top options." If it disagrees meaningfully with what step 3's live search finds, trust the live search.
   - The user's current roster needs, accounting for flex-slot eligibility
   - current_round, my_next_pick_number, and my_picks_so_far

   If the user's message specified a round or pick number (via shorthand or full sentence) and it doesn't match what draft_status reports as current_round/my_next_pick_number, stop and flag the mismatch before doing anything else — ask which is correct rather than guessing or silently picking one. This catches typos and also surfaces genuine confusion (e.g. a missed pick, a trade that shifted the draft order) worth the user knowing about immediately.

## Round-appropriate filter — applies to every section, always

No player appears anywhere in this response — watchlist, top graded at position of need, top options overall, or sleeper picks — unless their realistic outlook is plausible for the round actually being discussed. This is not a sleeper-only rule; it governs the entire response. A depth-chart RB3 on a run-heavy team, or a rookie buried behind an entrenched starter with no clear path to touches, does not belong in a round 1-8 response in ANY section, including "top options overall" or the watchlist — being well-known, being on the watchlist, or fitting a category label never exempts a name from this check. If a section would otherwise be empty because nothing clears the bar, say so plainly rather than including a name that doesn't hold up.

## Baseline round-position reference

This is a starting-point guide for what to prioritize each round, based on your roster's structure (verified against your league's actual 18-round, 12-starter format). Treat this as a baseline to weigh alongside live signals — never follow it blindly if live scarcity, roster needs, or pick-timing point elsewhere. If live signals and this baseline conflict, say so explicitly (e.g. "baseline says WR here, but RB is thinning fast — leaning RB instead").

| Round | Baseline focus |
|---|---|
| 1 | Elite RB/WR/QB — best player available among the top tier |
| 2 | Alpha WR or workhorse RB, whichever tier is stronger |
| 3 | Workhorse RB |
| 4 | High-volume WR2 |
| 5 | High-floor RB2 |
| 6 | Superflex QB2 — lock in your second starting-caliber QB |
| 7 | Elite TE |
| 8-10 | Flex depth (mix of WR/RB) — fill your 3 FLEX slots |
| 11 | Superflex QB3 — bye-week/backup depth for your QB slots |
| 12-15, 18 | Bench depth and fliers — upside pieces, handcuffs, sleepers |
| 16 | Kicker |
| 17 | Defense |

2. **Identify the 1-2 positions to prioritize this round.** If the user's message included an explicit position override (see shorthand rules above), use that position directly and skip the rest of this step's auto-selection logic — just note briefly if it conflicts with need or baseline. Otherwise, determine the position based on:
   - The baseline round-position reference above, as a starting point
   - The user's roster needs from draft_status (unfilled starting slots and flex eligibility)
   - How thin the available player pool is getting at each needed position (if a position's top tier is about to run out, flag it even if it's not the most urgent roster need)
   - How many picks until the user's next turn (from draft_status). The fewer picks remaining before their next turn, the stronger the case to reach for a thinning position now rather than wait — if a needed position's top tier looks likely to be gone by their next pick, say so explicitly (e.g. "only 3 picks until you're up again, and the RB tier is thin — this is the round to grab one if you want this tier").

3. **Call `get_watchlist`** and cross-reference it against the prioritized position(s) and draft_status's drafted-players list. Exclude any watchlist player who already appears in the drafted-players list — this includes players you drafted yourself, not just ones taken by others. From what's left, keep only names that are round-appropriate at that position — e.g. in round 1, only a genuine WR1-tier name qualifies, not someone realistically a round 5-6 pick. Use the same realism standard as the sleeper-pick check below. Tag any non-null injury_status inline (e.g. "⚠️ Questionable") — the watchlist data already includes this field. If nothing on the watchlist clears that bar, say so plainly (e.g. "Nothing on your watchlist fits this round at [position]") rather than forcing a weak name in.

4. **Web search for current rankings/tiers** at the prioritized position(s) to build the "top graded at position of need" and "top options overall" sections:
   - **Top graded at position of need**: the best available players specifically at the position(s) identified in step 2, filtered to the same round-appropriate standard as the watchlist check — don't list a player here whose realistic outlook doesn't match this round.
   - **Top options overall**: the best available players regardless of position — true best-player-available, even if it's not a position of current need. This can overlap with the position-of-need list; that's fine, it's a different lens (need-filtered vs. unfiltered).
   - Cross-check every candidate against draft_status's list of drafted players — do not suggest anyone who already appears in that list. `search_rank_reference` can be a quick starting point, but the actual recommendation should come from the live search, not from search_rank alone.
   - For each player, include one short context clue alongside the reason — team offensive tendency (run-heavy vs. pass-heavy), target share, snap-count trend, or role security. Keep it to a phrase, not a second sentence.
   - If a player has a non-null injury_status (Questionable, Doubtful, Out, etc.) from the player database or watchlist data, tag it inline (e.g. "⚠️ Questionable") — don't bury it in the reason text, and don't omit it even for a strong recommendation.
   - **Dedupe against the watchlist section**: if a player already appears in the watchlist section, don't repeat them in these sections — instead tag them inline where they'd otherwise appear (e.g. "Jonathan Taylor — RB, IND — RB1 in a run-heavy offense ⭐ on your watchlist").

5. **Web search for sleeper picks** at the prioritized position(s). A sleeper must be realistic for the round it's suggested in — the upside case has to be plausible at this point in the draft, not a distant long-shot dressed up as insight. A depth-chart RB3 on a run-heavy team, or a rookie buried behind an entrenched starter with no clear path to touches, is not a sleeper in rounds 1-8 — that's a round 12+ flier at best. Sleepers are inherently harder to call with confidence in early rounds and will most often be legitimately useful starting in the middle-to-late rounds — it's fine, and often correct, to say there's no credible sleeper for an early-round pick rather than force one. Dedupe against the watchlist section the same way as step 4.

6. **Respond in this consistent format every time:**

   ```
   Recommended position(s): [position or positions, with a one-line reason]

   From your watchlist:
   - [Player] — [team/position] — [value read: good value / fair / slight reach] [⚠️ status if applicable]
   [If nothing on the watchlist clears the round-appropriate bar, replace with:
   "Nothing on your watchlist fits this round at [position]."]

   Top graded at [position of need]:
   - [Player 1] — [team/position] — [reason + context clue] [⭐ if also on watchlist] [⚠️ status if applicable]
   - [Player 2] — [team/position] — [reason + context clue]
   - [Player 3] — [team/position] — [reason + context clue]

   Top options overall:
   - [Player 1] — [team/position] — [reason + context clue] [⭐ if also on watchlist] [⚠️ status if applicable]
   - [Player 2] — [team/position] — [reason + context clue]
   - [Player 3] — [team/position] — [reason + context clue]

   Sleeper picks:
   - [Player 1] — [team/position] — [why + context clue] [⭐ if also on watchlist] [⚠️ status if applicable]
   - [Player 2] — [team/position] — [why + context clue]
   [Omit entirely, or note "no credible sleeper this early," if nothing fits.]
   ```

   If multiple positions were specified via override, repeat this entire block once per position, clearly labeled with a heading per position (e.g. "### WR" / "### RB").

7. **Keep it fast.** This is used under a 2-minute draft clock — don't pad with extra caveats or lengthy explanations. One line per player is enough.

## Fallback behavior

If `draft_status` reports it's using fallback data (Sleeper API unreachable), say so plainly at the top of the response, and note that sleeper-pick suggestions may be less current since they rely on the static fallback list rather than live rankings.

## Notes

- "Sleeper picks" here means undervalued/later-round-value players relative to their current ADP or draft position — not literally players on the Sleeper platform. Don't confuse the two in the response.
- If the user's roster needs are already fully met in required slots and only bench/flex value remains, say so and shift to best-player-available reasoning instead of a specific need.
- This league has CPU autopick enabled — if the user misses their 2-minute window, Sleeper picks for them automatically. This makes response speed genuinely important, not just a nice-to-have: don't run more searches than needed to answer confidently.
- This is a snake draft with an unknown draft order until Sleeper assigns it near draft day. draft_status calculates picks-until-next-turn once the order is set — always use that live number rather than assuming a fixed gap between the user's picks.
- `search_rank_reference` exists to save time scanning names, not to replace judgment. Never present a search_rank_reference player as a "top option" or "sleeper" without confirming that positioning against the live search — search_rank can easily surface a well-known but currently declining player, or miss a rising one, since it isn't fantasy-specific.
- The response leads with the watchlist because the user wants their own tracked players surfaced first — but the round-appropriate filter still applies fully; a watchlist player never gets a pass on realism just for being on the list. Never repeat a player across sections — dedupe and tag with ⭐ instead.
