# Sleeper Fantasy Football MCP Server

A remote MCP (Model Context Protocol) server that wraps the [Sleeper](https://sleeper.com) fantasy football public API. It runs as an HTTP service (Streamable HTTP transport) so it can be reached from Claude Desktop **and** the Claude mobile app over the internet — useful for pulling league data mid-draft from your phone.

Sleeper's API (`https://api.sleeper.app/v1/`, [docs](https://docs.sleeper.com/)) is public and read-only, so this server never touches league settings, rosters, or picks — it only reads.

## Status

Working end to end over Streamable HTTP with bearer token auth, deployed to Railway, and verified through both curl and Claude's custom connector (desktop and mobile). All tools so far are thin, direct pass-throughs of Sleeper's raw API responses — no reshaping, filtering, or bundled/derived logic yet (e.g. a live "draft board + available players" tool). See [Available tools](#available-tools).

## Project structure

```
src/
  config.js         # reads env vars once, exports a typed config object
  sleeperClient.js   # thin wrapper around Sleeper's REST API
  auth.js            # bearer token middleware
  tools.js           # MCP tool definitions (registered against an McpServer)
  server.js          # express app: /health, /mcp, auth wiring, listen()
.env.example
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

All tools are scoped to the league configured via `SLEEPER_LEAGUE_ID` — none take a league ID as an argument. Each is a thin, direct pass-through of Sleeper's raw JSON response for the corresponding endpoint (see [Sleeper's API docs](https://docs.sleeper.com/)) — no reshaping applied, except `get_league_settings`, which narrows the response to the fields most relevant for draft/season prep.

| Tool | Sleeper endpoint | Arguments |
|---|---|---|
| `get_league_settings` | `GET /league/<league_id>` | — |
| `get_rosters` | `GET /league/<league_id>/rosters` | — |
| `get_league_users` | `GET /league/<league_id>/users` | — |
| `get_matchups` | `GET /league/<league_id>/matchups/<week>` | `week` (number) |
| `get_transactions` | `GET /league/<league_id>/transactions/<round>` | `round` (number — week in a standard league, round in best ball) |
| `get_traded_picks` | `GET /league/<league_id>/traded_picks` | — |
| `get_nfl_state` | `GET /state/nfl` | — |
| `get_draft_picks` | `GET /draft/<draft_id>/picks` | `draft_id` (string — get it from `get_league_settings` first) |
| `get_draft_traded_picks` | `GET /draft/<draft_id>/traded_picks` | `draft_id` (string — get it from `get_league_settings` first) |
| `get_trending` | `GET /players/nfl/trending/<type>` | `type` (`"add"` or `"drop"`), `lookback_hours` (number, optional), `limit` (number, optional) |

`draft_id` is never configured statically — Sleeper issues a new one each season, so call `get_league_settings` first and pass its `draft_id` into the draft-scoped tools.

## Running locally

```bash
npm install
cp .env.example .env   # then fill in real values
npm start               # or: npm run dev (auto-restarts on changes)
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

## Limitations

- Read-only — this cannot modify anything in your Sleeper league.
- Single league per deployment (`SLEEPER_LEAGUE_ID` is one value in config, not a tool argument).
- Stateless request handling — each MCP request spins up its own transport, so there's no server-side session state to lose on a Railway restart, but also no resumable streaming across requests.
- All tools are raw pass-throughs of Sleeper's API (aside from `get_league_settings`'s light field selection) — no bundled/derived tools yet (e.g. "draft board + available players + my roster needs" in one call).

## License

MIT
