# Sleeper Fantasy Football MCP Server

A remote MCP (Model Context Protocol) server that wraps the [Sleeper](https://sleeper.com) fantasy football public API. It runs as an HTTP service (Streamable HTTP transport) so it can be reached from Claude Desktop **and** the Claude mobile app over the internet — useful for pulling league data mid-draft from your phone.

Sleeper's API (`https://api.sleeper.app/v1/`, [docs](https://docs.sleeper.com/)) is public and read-only, so this server never touches league settings, rosters, or picks — it only reads.

## Status

Working end to end over Streamable HTTP with bearer token auth, deployed to Railway, and verified through both curl and Claude's custom connector (desktop and mobile). All tools so far are thin, direct pass-throughs of Sleeper's raw API responses — no reshaping, filtering, or bundled/derived logic yet (e.g. a live "draft board + available players" tool). See [Available tools](#available-tools).

## Project structure

```
src/
  config.js             # reads env vars once, exports a typed config object
  sleeperClient.js      # thin wrapper around Sleeper's REST API; every call gets a timeout + clear error
  playerCache.js        # in-memory NFL player_id -> name/position/team lookup + search_rank fallback rankings
  flexEligibility.js    # shared slot/flex-eligibility + assignment logic
  draftStatus.js        # draft_status: snake-order/trade math + player pool scan
  rosterNeeds.js        # roster_needs: starting-slot fill status via flexEligibility.js
  watchlist.js          # get_watchlist: reads data/watchlist.json, resolves names via playerCache.js
  recentPerformance.js  # get_recent_performance: weekly stats -> fantasy points via scoring_settings + usage
  auth.js               # bearer token middleware
  tools.js              # MCP tool definitions (registered against an McpServer)
  server.js             # express app: /health, /mcp, auth wiring, listen()
.env.example          # example .env file structure with placeholder values
data/watchlist.json   # manually-maintained player watchlist -- see Available tools below
```

Adding a new tool means: add a fetch function to `sleeperClient.js`, register a tool in `tools.js` that calls it. `server.js` and `auth.js` don't need to change.

## Prerequisites

- Node.js 24.16.0 (pinned in `package.json` under `engines`)
- A Sleeper league ID and user ID

**Finding your league ID:** open your league in the Sleeper web app — the URL contains a long numeric league ID (e.g. `sleeper.com/leagues/1234567890123456789/team`).

**Finding your user ID:** visit `https://api.sleeper.app/v1/user/<your_sleeper_username>` in a browser and copy the `user_id` field.

## Environment variables

Config is read once in `src/config.js` — nothing else in the codebase touches `process.env` directly. All three are required; the server refuses to start without them.

| Variable | Purpose |
|---|---|
| `SLEEPER_LEAGUE_ID` | Your Sleeper league ID |
| `SLEEPER_USER_ID` | Your Sleeper user ID |
| `MCP_AUTH_TOKEN` | Bearer token every request must present — see [Auth](#auth) |
| `PORT` | *(local dev only)* port to listen on; defaults to `3000`. Railway sets this itself in production — see [Deploying to Railway](#deploying-to-railway) |

Copy `.env.example` to `.env` and fill in real values:

```bash
cp .env.example .env
```

Generate a strong `MCP_AUTH_TOKEN`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`.env` is git-ignored — never commit real values. `.env.example` only ever holds placeholders.

## Auth

Every request to `/mcp` must include:

```
Authorization: Bearer <MCP_AUTH_TOKEN>
```

Missing or incorrect tokens get a `401` before any MCP or Sleeper logic runs (`src/auth.js`, compared with a constant-time check). This is the only thing standing between your league data and the open internet, since the server has no other access control — treat `MCP_AUTH_TOKEN` like a password and don't share it or commit it.

`/health` is intentionally unauthenticated (just a liveness check with no league data) so Railway's health checks can hit it freely.

`/mcp` also has CORS enabled (wide-open origin) so browser-based clients — e.g. claude.ai's own custom connector setup, which validates/connects from the browser rather than server-side — can complete the preflight `OPTIONS` request before the real one carries the bearer token. CORS is not access control here; the bearer token is.

## Available tools

All tools are scoped to the league configured via `SLEEPER_LEAGUE_ID` — none take a league ID as an argument. Each is a thin, direct pass-through of Sleeper's raw JSON response for the corresponding endpoint (see [Sleeper's API docs](https://docs.sleeper.com/)) — no reshaping applied, except `get_league_settings`, which narrows the response to the fields most relevant for draft/season prep: `league_id`, `name`, `season`, `status`, `sport`, `settings`, `scoring_settings` (point values for every stat category — passed through unmodified), `roster_positions`, and `draft_id`.

| Tool | Sleeper endpoint | Arguments |
|---|---|---|
| `get_league_settings` | `GET /league/<league_id>` | — |
| `get_rosters` | `GET /league/<league_id>/rosters` | `resolve_players` (boolean, optional) |
| `get_league_users` | `GET /league/<league_id>/users` | — |
| `get_matchups` | `GET /league/<league_id>/matchups/<week>` | `week` (number), `resolve_players` (boolean, optional) |
| `get_transactions` | `GET /league/<league_id>/transactions/<round>` | `round` (number — week in a standard league, round in best ball), `resolve_players` (boolean, optional) |
| `get_traded_picks` | `GET /league/<league_id>/traded_picks` | — |
| `get_nfl_state` | `GET /state/nfl` | — |
| `get_draft_picks` | `GET /draft/<draft_id>/picks` | `draft_id` (string — get it from `get_league_settings` first), `resolve_players` (boolean, optional) |
| `get_draft_traded_picks` | `GET /draft/<draft_id>/traded_picks` | `draft_id` (string — get it from `get_league_settings` first) |
| `get_trending` | `GET /players/nfl/trending/<type>` | `type` (`"add"` or `"drop"`), `lookback_hours` (number, optional), `limit` (number, optional), `resolve_players` (boolean, optional), `exclude_rostered` (boolean, optional) |
| `draft_status` | *(bundled — see below)* | — |
| `roster_needs` | *(bundled — see below)* | — |
| `get_watchlist` | *(local file, not Sleeper — see below)* | — |
| `get_recent_performance` | *(bundled — see below)* | `player_ids` (string array), `weeks_back` (number, optional, default 4, hard max 4) |

`draft_id` is never configured statically — Sleeper issues a new one each season, so call `get_league_settings` first and pass its `draft_id` into the draft-scoped tools.

### Resolving player_ids

Sleeper's raw API returns players as bare `player_id` strings (in `players`/`starters`/`reserve`/`taxi` arrays, `adds`/`drops` objects, or a pick's `player_id`) — not human-readable names. Passing `resolve_players: true` to `get_rosters`, `get_matchups`, `get_transactions`, `get_draft_picks`, or `get_trending` adds sibling `*_resolved` field(s) with `{ player_id, name, position, team, status, injury_status, years_exp, fantasy_positions }` for each one, alongside the untouched raw IDs. It defaults to `false` (raw pass-through) since not every caller needs it.

The lookup is served from an in-memory copy of Sleeper's full player database (`GET /players/nfl`, ~5MB), fetched once at server startup and refreshed roughly every 24 hours in the background for the life of the process (`src/playerCache.js`) — per-request calls to that endpoint aren't made, in line with Sleeper's guidance not to poll it more than once a day. The startup fetch doesn't block the server from listening, so `/health` and the rest of `/mcp` come up immediately regardless of how long it takes; a tool call needing resolution simply awaits the in-flight load if it hasn't finished yet. If a refresh ever fails, the server logs it and keeps serving the last good data — it never crashes or clears the cache over a bad fetch.

Two Sleeper quirks are handled explicitly: a team defense in `players`/`starters` is a team code (e.g. `"DET"`) rather than a numeric ID, resolved to `{ name: "Detroit Lions", position: "DEF", team: "DET" }`; and `"0"` is Sleeper's placeholder for an empty roster slot, resolved to `{ name: "Empty slot", position: null, team: null }` rather than an unknown-player lookup.

`get_trending` additionally cross-references the configured league's rosters. With `resolve_players: true`, each entry's `player_resolved` gains `rostered` (boolean) and, if rostered, `rostered_by: { roster_id, owner_id }` — so an already-rostered trending player shows up as a potential trade target rather than disappearing, since that's still useful signal. Pass `exclude_rostered: true` instead if you'd rather hard-filter down to free agents only (usable independently of `resolve_players`).

### draft_status

A bundled, no-argument tool for live draft day (`src/draftStatus.js`) — combines `get_league_settings`, `get_rosters`, the draft object, `get_draft_picks`, and `get_draft_traded_picks` into one call, scoped to `SLEEPER_LEAGUE_ID`/`SLEEPER_USER_ID`. Returns:

- `current_round`, `status`, `total_rounds`
- `my_next_pick_number` — the overall pick number you pick next in snake order, accounting for traded picks. If you're on the clock right now, this is your *current* pick number, not the one after it.
- `picks_so_far` — every pick made in the draft, with resolved player `{ name, position, team }`
- `my_picks_so_far` — just your own picks, same shape
- `remaining_players_by_position` — per position, a `count` of undrafted players plus `search_rank_reference`: the top 5 by Sleeper's own `search_rank` field. That field is a general search-relevance number Sleeper assigns (lower = more prominent), **not** a curated fantasy ranking or ADP — treat it as a rough reference only, not draft advice.

Performance note: beyond the network calls (run in parallel), everything else — snake-order/trade-reconciliation math and the undrafted-player-by-position scan — is synchronous in-memory work over already-cached data (the player scan never hits Sleeper's API itself), so this stays fast under a live draft clock regardless of draft size.

**Fallback mode:** if `get_league_settings`'s own call succeeds but the rosters/draft/picks/traded-picks batch fails (timeout, network error, non-2xx from Sleeper), `draft_status` doesn't throw — it returns `fallback_mode: true` instead, with `status`, `total_rounds`, `current_round`, `my_roster_id`, `my_next_pick_number`, `picks_so_far`, and `my_picks_so_far` all explicitly `null` (also listed in `unavailable_fields`, since none of them can be derived without live picks data — there's no way to know whose turn it is or who's been drafted otherwise), a `fallback_reason` with the underlying error, and `generally_strong_players_overall`/`generally_strong_players_by_position` — Sleeper's own `search_rank`-derived snapshot from `playerCache.js` (see [Error handling & graceful degradation](#error-handling--graceful-degradation) below). Named `generally_strong_players_*`, not `available_players_*`, since fallback mode has no idea what's actually been drafted. If `get_league_settings` itself fails, there's no `draft_id` to work with at all, so that's a hard tool error, not fallback mode.

### roster_needs

A bundled, no-argument tool for in-season use (`src/rosterNeeds.js`) — checks your starting lineup's roster construction, scoped to `SLEEPER_LEAGUE_ID`/`SLEEPER_USER_ID`. Assigns your rostered players to your league's starting slots most-constrained-first (dedicated positions, then `FLEX`, then `SUPER_FLEX`, etc.), so a player is never double-counted against more than one slot — flex eligibility nests perfectly in standard fantasy football (dedicated ⊂ FLEX ⊂ SUPER_FLEX), which makes that ordering provably optimal, not just a heuristic. The assignment/eligibility logic lives in `src/flexEligibility.js`, factored out so other tools (e.g. a future update to `draft_status`) can reuse it rather than reimplementing flex reasoning.

Returns `slots`: an array in your league's declared `roster_positions` order (bench/IR/taxi excluded), each with:

- `slot` — the slot type (`QB`, `RB`, `FLEX`, `SUPER_FLEX`, etc.)
- `fill_status` — `"solid"` (filled, no injury flag), `"questionable"` (filled, but that player has a non-null Sleeper `injury_status`), or `"empty"` (no eligible rostered player left to fill it — a genuine roster gap)
- `player` — that slot's assigned player (`{ player_id, name, position, team, injury_status }`), or `null` if empty

Plus a `summary` with `solid`/`questionable`/`empty` counts. This is about roster **construction** only — whether a slot has an eligible, healthy player at all — not a judgment about whether that player is any good; that's left to you.

### get_watchlist

A bundled, no-argument tool that reads `data/watchlist.json` — a manually-maintained JSON array of player name strings — and resolves each one against the player database (`src/watchlist.js`). Unlike every other tool here, this doesn't call Sleeper's API at all; it's a local file read plus a name lookup against the same in-memory player cache `resolve_players` and `draft_status` already use.

Returns an array with one entry per name in the file:

- `requested_name` — exactly what was in `watchlist.json`
- `resolved` — `true`/`false`
- `player_id`, `name`, `position`, `team`, `status`, `injury_status`, `years_exp`, `fantasy_positions` — populated if resolved, all `null` if not

Matching is exact and case-insensitive — no fuzzy matching. A name with no match in the player database comes back with `resolved: false` rather than failing the whole call, so one typo in a long watchlist doesn't break it. `position` is included specifically so results can be filtered by position group (e.g. for round-by-round draft advice) without a second lookup.

**Updating your watchlist:** edit `data/watchlist.json` (a plain JSON array of name strings), commit, and push — Railway redeploys automatically and picks up the new file. This is a manual, infrequent update — expected to change mainly before draft day, not something with hot-reloading, so a change won't take effect until the next deploy. It ships with a single placeholder entry (`"Example Player Name"`, which will show up as `resolved: false` until you replace it) — swap in your real list before relying on this tool.

### get_recent_performance

A bundled tool (`src/recentPerformance.js`) for evaluating actual recent game performance — the only tool here that touches real game stats rather than roster/draft structure, useful for checking whether rostered players are actually being utilized/producing. Takes `player_ids` (an array of Sleeper player IDs — a full roster's worth at once is the expected use) and an optional `weeks_back` (default 4, hard max 4).

1. Reads the current season/week/`season_type` (`GET /state/nfl`) and the league's real `scoring_settings` (`GET /league/<league_id>`), fetched fresh and in parallel.
2. Only ever includes **completed regular-season** weeks — the current in-progress week is never included, since its stats aren't final yet, and nothing is included at all unless `season_type` is `"regular"`. Sleeper's `week` field counts differently outside the regular season (e.g. preseason weeks during `season_type: "pre"`), and those numbers don't correspond to anything on the regular-season stats endpoint — so outside the regular season this always returns `weeks: []` for every player, by design, not a bug. If fewer than `weeks_back` completed weeks exist so far in the regular season (e.g. it's week 2), you get however many are actually available, down to zero in week 1.
3. Fetches Sleeper's weekly stats (`GET /stats/nfl/regular/<season>/<week>`) **once per completed week, not once per player** — at most 4 Sleeper calls total no matter how many `player_ids` are passed.
4. Computes each player's fantasy points per week by summing every stat category in the league's `scoring_settings` against that week's raw stats for that player (`points += scoring_settings[stat] * raw_stats[stat]` for every key present in both) — this generically follows whatever scoring the league actually uses rather than hardcoding PPR/standard math.
5. Also surfaces raw usage indicators when Sleeper's response includes them: `targets`, `carries`, `receptions`, `snaps`, and `snap_pct` (snap share, computed from the player's snap count over the team's total offensive snaps that week).
6. A bye week within the lookback window is flagged `{ week, bye: true }` instead of a misleading 0 — inferred by checking whether *any* player on that team has stats for that week at all (Sleeper's stats endpoint has no explicit bye flag), not from a separate schedule lookup. That inference only runs once a week's response actually has data for at least 20 of the league's 32 teams (a real bye week only ever affects a handful of teams at once) — a sparser response means the week's data didn't load correctly for some other reason, and is treated as no data at all rather than mislabeled as a mass bye. (This is exactly the failure mode hit and fixed during initial verification: calling the regular-season endpoint with preseason week numbers returned empty responses, which the original bye heuristic misread as every team being on a bye.)
7. A week with no data at all for a player (not yet on a roster, hasn't debuted, etc.) is simply omitted from that player's `weeks` array rather than shown as a fabricated zero.

Returns an array with one entry per requested `player_id`: `{ player_id, name, position, team, weeks }`, where `weeks` is `[{ week, fantasy_points, usage: { targets?, carries?, receptions?, snaps?, snap_pct? } }, ...]` (or `{ week, bye: true }` for a bye week). No trend judgment (improving/declining) is computed here — that's left to whatever calls this tool.

**Caveat on stat key names:** the mapping from Sleeper's raw weekly stat keys to `targets`/`carries`/`receptions`/`snaps` (`rec_tgt`, `rush_att`, `rec`, `off_snp`/`tm_off_snp`) is based on documented/observed Sleeper stat category names, not yet verified against a live regular-season response — this sandbox can't reach `api.sleeper.app`, and the season is still in preseason as of this writing. The fantasy-points computation doesn't depend on this mapping (it sums directly against whatever keys `scoring_settings` itself uses), so scoring should be correct regardless; only the usage indicators are at risk if Sleeper's real key names differ. Worth a real `get_recent_performance` call once the regular season starts to confirm both line up.

## Error handling & graceful degradation

The goal: if something breaks mid-draft — Sleeper's API, your network, or Railway — you get a fast, honest signal about what's wrong, not a stuck tool call or a silent empty result.

- **Every Sleeper call has a timeout.** `sleeperFetch()` in `src/sleeperClient.js` is the single chokepoint every tool goes through, so this applies everywhere: 10 seconds by default, 30 seconds for the ~5MB player database fetch. A hung connection fails loudly instead of hanging the tool call forever.
- **Errors are differentiated, not generic.** A timeout, a network-level failure (DNS, connection refused), and a non-2xx HTTP response from Sleeper each produce a distinct, clear message (e.g. `"Sleeper API request to /league/<id> timed out after 10s"` vs `"Sleeper API network error fetching ...: fetch failed"` vs `"Sleeper API error fetching ...: 503 Service Unavailable"`). The MCP SDK turns a thrown error into a clean `isError: true` tool result automatically, so Claude sees the real message rather than a raw exception.
- **Auth rejects clearly.** A missing or wrong bearer token always gets an explicit `401` with a JSON-RPC error body (`src/auth.js`) — never a silent empty result. If something's misconfigured client-side (e.g. on your phone), you get an obvious rejection instead of confusing silence.
- **Fallback rankings, derived automatically — no file to maintain.** Every time `playerCache.js` successfully refreshes the player database (startup, then ~every 24h), it also computes a fallback ranking snapshot from that same data: the top 100 players overall by Sleeper's `search_rank`, plus the top 5 per position. A failed refresh never overwrites this with empty data — the last good snapshot keeps serving. Always labeled by `search_rank` explicitly wherever it's used (`draft_status`'s fallback mode currently), since it's Sleeper's own rough search-relevance signal, not a curated fantasy ranking.
- **`draft_status` degrades field-by-field**, not all-or-nothing — see [above](#draft_status) for exactly which fields go `null` in fallback mode and why.

### Manually verifying fallback mode

There's no way to make Sleeper's real API fail on command, so `src/sleeperClient.js` has a manual verification switch — **not a real feature, not part of normal configuration** (it's not in `config.js` or `.env.example`). Set the `SIMULATE_SLEEPER_OUTAGE` environment variable (to any value) in Railway's Variables tab and redeploy/restart:

- `getRosters`, `getDraft`, `getDraftPicks`, and `getDraftTradedPicks` throw instantly (no network call at all) — exactly the batch `draft_status` depends on for live pick data.
- `getLeague` and `getPlayers` are untouched, so `get_league_settings` still succeeds and the player cache keeps working normally.

That combination is what makes `draft_status` land in genuine `fallback_mode: true` rather than the hard top-level error it throws when `get_league_settings` itself fails (no `draft_id` means nothing can be computed at all — see [above](#draft_status)).

**While the flag is set**, `get_rosters`, `get_draft_picks`, and `get_draft_traded_picks` will also show the simulated error, since they call the same underlying functions directly — expected for a short verification window, not something to leave on.

To verify: set `SIMULATE_SLEEPER_OUTAGE`, redeploy, call `draft_status`, confirm the response shows `fallback_mode: true`, a `fallback_reason` mentioning the simulated outage, `generally_strong_players_overall`/`generally_strong_players_by_position` populated from the real cached player data, and every field in `unavailable_fields` set to `null`. **Then remove the variable and redeploy again before relying on this for an actual draft** — nothing about this switch is meant to survive past the verification.

## Running locally

```bash
npm install
cp .env.example .env  # then fill in real values
npm start             # or: npm run dev (auto-restarts on changes)
```

The server listens on `http://localhost:3000` (or `$PORT` if set).

Quick smoke test with curl:

```bash
# health check (no auth)
curl http://localhost:3000/health

# MCP initialize (replace the token with your MCP_AUTH_TOKEN)
curl -s http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <your MCP_AUTH_TOKEN>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'

# call the tool
curl -s http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <your MCP_AUTH_TOKEN>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_league_settings","arguments":{}}}'
```

A request with no `Authorization` header, or the wrong token, should get `401`.

## Connecting a client

This server uses the **Streamable HTTP** transport (a single `/mcp` endpoint, not stdio), so it's added as a remote MCP server pointing at your deployed URL plus the bearer token, per each client's own instructions for adding a remote/custom MCP connector. Point it at `https://<your-railway-domain>/mcp` with the `Authorization: Bearer <MCP_AUTH_TOKEN>` header configured as that client requires.

## Deploying to Railway

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. In Railway, create a new project (or use an existing one) and add a service from that GitHub repo.
3. Railway auto-detects Node.js and runs `npm install` then `npm start`. No `Procfile` or Dockerfile needed for this setup.
4. In the service's **Variables** tab, set `SLEEPER_LEAGUE_ID`, `SLEEPER_USER_ID`, and `MCP_AUTH_TOKEN` (use a different, strong value than any local dev token). Do **not** set `PORT` — Railway injects it automatically.
5. **Important — `PORT`:** Railway assigns the container's listening port dynamically via the `PORT` environment variable at runtime; it is not fixed and not knowable in advance. `src/server.js` reads `process.env.PORT` (via `src/config.js`) and falls back to `3000` only when it's unset, which only happens in local dev. Never hardcode a port — a hardcoded port will not receive traffic on Railway.
6. Deploy. Railway will give you a public domain like `https://<service>.up.railway.app`. Your MCP endpoint is `https://<service>.up.railway.app/mcp`.
7. Verify with the same curl commands as above, swapping `localhost:3000` for your Railway domain, then point Claude Desktop / mobile at that URL with your `MCP_AUTH_TOKEN`.

## Maintenance

**Rotating `MCP_AUTH_TOKEN`:** do this any time the token might have leaked (pasted somewhere it shouldn't have been, shared, etc.) — it's the only thing protecting your league data on the open internet.

1. Generate a new one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Railway → service → **Variables** → update `MCP_AUTH_TOKEN` to the new value. Railway redeploys/restarts automatically.
3. Update every client that connects to this server (claude.ai custom connector, any local `.env` you test against) with the new token — the old one stops working the moment Railway picks up the change.
4. Verify with a quick `tools/call` (e.g. `get_league_settings`) using the new token before considering it done.

**Updating for a new season:** Sleeper issues a new `SLEEPER_LEAGUE_ID` each season (linked to the prior one via `previous_league_id` in Sleeper's own data, not anything this server tracks). When your league rolls over:

1. Find the new league ID the same way as [Prerequisites](#prerequisites) describes — open the new season's league in the Sleeper app, copy the numeric ID from the URL.
2. Railway → service → **Variables** → update `SLEEPER_LEAGUE_ID` to the new value and redeploy.
3. No code changes needed, and nothing else to update — `draft_id` is always read live from `get_league_settings` (never cached or configured separately), and every tool re-derives everything else (rosters, draft, players) from the league ID at request time.

## Limitations

- Read-only — this cannot modify anything in your Sleeper league.
- Single league per deployment (`SLEEPER_LEAGUE_ID` is one value in config, not a tool argument).
- Stateless request handling — each MCP request spins up its own transport, so there's no server-side session state to lose on a Railway restart, but also no resumable streaming across requests.
- Most tools are raw pass-throughs of Sleeper's API (aside from `get_league_settings`'s light field selection); `draft_status`, `roster_needs`, and `get_recent_performance` are the bundled/derived tools so far — see [above](#draft_status).
- No fantasy rankings/ADP/projections anywhere — Sleeper's raw API doesn't provide them, and `draft_status`'s `search_rank_reference` is explicitly a rough proxy (Sleeper's own search-relevance field), not draft advice. Real rankings would need a separate data source and aren't integrated.

## License

None
