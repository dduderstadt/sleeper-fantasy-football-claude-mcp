---
name: draft-grade
description: Use whenever the user asks to grade a draft pick, their draft, or a specific round — e.g. "grade my pick", "grade my draft", "grade round 5", "how'd I do with that pick", "rate my draft so far". Calls the Sleeper MCP server's draft_status tool and evaluates primarily on value vs. ADP and overall roster fit, returning a letter grade with a short explanation.
---

# Draft Grade

## When to use this

Trigger this when the user asks something like:
- "Grade my pick" / "grade that pick" / "how'd I do?" — grades their single most recent pick
- "Grade my draft" / "grade my team" / "how's my draft going overall?" — grades the full roster drafted so far (or the complete draft, if it's finished)
- "Grade round X" — grades every pick the user made in round X specifically (usually one, but more if a trade moved extra picks into that round), each individually, plus one overall grade for the round if there's more than one pick
- **Self-reported pick**: the user directly states what they just drafted, e.g. "I drafted [player] in round Y at pick Z," "just took [player] at 3.24," "picked [player] round 4" — treat this as an immediate grade request for exactly that pick. Don't wait on `draft_status` to reflect it first; grade based on what the user just told you, since Sleeper's data may lag a few seconds behind the actual pick. Still call `draft_status` for roster/needs context, but trust the user's stated player/round/pick over what draft_status shows if the two disagree (the user's live report is fresher than a possibly-delayed sync) — just don't silently ignore a real discrepancy, mention it briefly if it's a large one (e.g. draft_status shows a completely different round). Cross-check the named player against draft_status's drafted-players list (already fetched in step 1, so this adds no extra lookup or delay) — if that same player was already drafted by someone else earlier in the list, flag that clearly rather than grading a pick that couldn't have actually happened.

Also trigger on shorthand, since this is used live on mobile during a fast-moving draft: "gr", "gp", "gd", "grade", "grade pick", "grade draft", "grade draft pick", "grade round X" / "gr X" / "grd X", and similar short variants. Any bare form without "draft" or a round number (e.g. "gr", "gp", "grade", "grade pick") defaults to single most-recent-pick scope; a form with "draft" (e.g. "gd", "grade draft") triggers full-draft scope; a form with a round number triggers round scope for that round.

Unlike `draft-round-advice`, this is NOT used under time pressure — the user typically has 20+ minutes between their own picks (waiting on 9 other teams in a 2-minute-per-pick draft). Still aim to be efficient by default — don't pad or stall unnecessarily — but if getting an accurate value/ADP read genuinely calls for a couple more searches or a bit more digging, take that time rather than rushing to a shallow answer just to be fast.

Do NOT trigger this for general "what should I draft" questions (that's `draft-round-advice`) or in-season roster questions (that's `weekly-check-in`). When phrasing is genuinely ambiguous between the two draft-day skills, use tense as the disambiguator: backward-looking language about a pick already made ("how'd that go," "was that good," "how did I do") means `draft-grade`; forward-looking language about a pick not yet made ("what should I take," "who's good here," "what do I need") means `draft-round-advice`. If it's still unclear which one is meant, ask rather than guessing.

## Steps to follow every time

1. **Call `draft_status`** to get current picks, my_picks_so_far, available players, and roster context. **Call `get_watchlist`** as well, and check whether the pick(s) being graded appear on it.

2. **Determine scope**: single most recent pick, a specific round, the full draft so far, or a self-reported pick (see trigger above — use the player/round/pick the user directly stated). If ambiguous, default to the most recent pick. Include the season year (from draft_status/league data, e.g. "2026") in the response header so it's unambiguous which season's draft is being graded — this matters since draft_id changes every year and old conversations could otherwise be confused with a new season's draft.

   If a specific round is requested and it's later than draft_status's current_round (the round hasn't happened yet), say so plainly and stop — don't attempt to grade a round with no picks in it, and don't fall back to grading something else instead.

3. **Evaluate each pick.** The weighting shifts by draft stage:

   **Early-to-mid rounds** (where a real ADP/value signal exists): value vs. ADP/consensus and overall roster fit are what drive the grade. A single good search for consensus rankings is often enough; dig further with another search or two if sources disagree or the picture is unclear, and note it if there's a real split rather than picking one source silently. Roster fit means judging the pick against the roster as a whole, not just the isolated need at that exact moment — a "needed" position pick can still be a weak fit if it creates redundancy elsewhere.

   **Late rounds** (K, DEF, deep bench fliers, per the baseline round-position table in `draft-round-advice`) — ADP barely differentiates anything this late, so don't grade on it. Instead grade on: did this pick adequately fill the slot (a startable-caliber K/DEF, a bench stash with a plausible role) given what was realistically available at that point? A serviceable, unremarkable late pick should land around a B/B-, not be punished for lacking ADP value that doesn't meaningfully exist at that stage. Always give a real letter grade here — don't decline to grade just because the data is thin.

   Minor factors, in both cases: upside/sleeper potential (a small nudge only — a breakout needs a lot to go right beyond talent, so don't let speculation carry the grade) and watchlist match (mention as a side note if relevant — zero effect on the grade either way). Roster balance (full-draft grades only) — does the overall roster avoid glaring gaps given the league's flex-heavy format?

4. **For grades below a clean A-tier, name the concrete alternative:**
   - **Single pick or round grading**: who else was realistically available at the same or a similarly-needed position at that point, and would have graded out better. Use `draft_status`'s pick-order data plus live rankings to reconstruct this. Skip this for late-round/low-stakes picks where the comparison is mostly noise (see late-round grading above) — a mediocre K in round 16 doesn't need a "you should have taken K2 instead" callout.
   - **Full-draft grading**: for every genuine weakness identified, give a concrete remedy — not just a diagnosis. The right remedy depends on whether the draft is still in progress or complete:
     - **Draft still in progress**: recommend which position(s) to prioritize with the remaining picks (this mirrors `draft-round-advice`'s baseline logic) — don't necessarily name specific players this far ahead, since availability will shift; naming the position and reasoning is usually enough.
     - **Draft complete**: name players who are STILL AVAILABLE right now (via draft_status's remaining players) and could realistically be added off waivers — this is actionable today, not a historical replay.
     - **Guardrails on remedies**: never suggest a fix that would undercut an existing strength (e.g. don't recommend punting on a strong position to fire-drill a weak one) — remedies should shore up weaknesses while preserving what's already working. Do NOT suggest trades as a remedy — that's an intentionally separate capability that hasn't been built into this skill; stick to draft-pick targeting or waiver moves only.

5. **Assign a letter grade** (A+, A, A-, B+, B, B-, C+, C, C-, D, F), weighted as described in step 3. Weigh holistically, not as a rigid point formula.

6. **Respond efficiently by default, but don't sacrifice accuracy for brevity.** Pick ONE of the two formats below — use the compact one unless the user has asked for more depth or the reasoning genuinely doesn't fit in a few lines.

   **Compact format (default) — single pick:**
   ```
   Grade: [letter] — [Player name] [⚠️ status if applicable]
   [1-3 sentences: the core value/fit reasoning, whichever actually matters here]
   [If below A-tier and not a late-round/low-stakes pick: Passed on: [player] — [one line why]]
   [If a real risk exists: Risk: [one line]]
   ```

   **Compact format — round:**
   ```
   Round [X] overall: [letter] (only if more than one pick this round)

   Pick 1: [Grade] — [Player] — [one line]
   Pick 2: [Grade] — [Player] — [one line]  (if applicable)
   ```

   **Compact format — full draft:**
   ```
   Overall Grade: [letter]
   Strengths: [1-2 sentences]
   Weaknesses: [1-2 sentences]
   Best value: [player] — [one line]
   Fixing it: [one line per genuine weakness — position to target next
   (if draft ongoing) or a specific still-available waiver name (if
   draft complete). Omit if there's no real weakness worth flagging.]
   ```

   **Detailed format (only when warranted)** — same structure as compact, but each bracketed section becomes a real paragraph instead of 1-3 sentences, with full citation of what research found. Use this when the user asks for more detail, or when a genuinely complex case (e.g. a real ADP disagreement across sources) can't be fairly summarized in one line.

7. **Keep it honest, not inflated.** This is meant to be a real read on the pick, not encouragement — if a pick was a reach or ignored a clear need, say so plainly while staying constructive.

## Notes

- Grades are a judgment call, not a formula — don't show numeric sub-scores per criterion. One clean letter grade with honest, proportionate reasoning is the right level of detail.
- If it's very early in the draft (round 1-2) and roster fit/balance can't really be judged in the context of a fuller roster yet, note that plainly rather than forcing a confident read.
- If the draft is complete, note that explicitly and treat the "full draft" grade as final rather than "so far."
