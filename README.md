# Sleeper Fantasy Football MCP Server

A local MCP (Model Context Protocol) server that connects Claude directly to your [Sleeper](https://sleeper.com) fantasy football league — no screenshots required.

## What this does

This tool lets Claude see your Sleeper league data directly — roster, draft picks, matchups — instead of you screenshotting it each time. It makes draft-day advice faster and more accurate, and simplifies weekly lineup and waiver-wire check-ins all season.

It wraps Sleeper's free, public, read-only API. It cannot modify anything in your league (no setting lineups, no adding/dropping players, no submitting trades) — for that you'll still use the Sleeper app directly. This is purely a read/advisory layer.

## Features

- **Raw data tools** — direct access to league settings, rosters, users, matchups, transactions, traded picks, draft picks, and trending adds/drops.
- **`draft_status`** — a bundled tool for live draft day: shows picks made so far (accounting for traded picks), available players by position, and your current roster needs given your league's flex-heavy roster format. Built for speed under a draft clock.
- **`roster_needs`** — a bundled tool for in-season use: reviews your current roster against your league's starting requirements and flags gaps, accounting for flex-slot eligibility.
- **In-memory player database** — fetched fresh on server start so player IDs resolve to real names, positions, and teams.
- **Graceful fallback** — if Sleeper's API is unreachable mid-draft, tools fall back to a local static rankings file with a clear flag that it's not live data, rather than failing silently.

## Prerequisites

- [Node.js](https://nodejs.org) (LTS version)
- [Claude Desktop](https://claude.com) or another MCP-compatible client
- A Sleeper account with an active league

## Installation

```bash
git clone <this-repo-url>
cd sleeper-mcp-server
npm install
```

## Configuration

Copy the example environment file and fill in your details:

```bash
cp .env.example .env
```

```env
SLEEPER_LEAGUE_ID=your_league_id_here
SLEEPER_USER_ID=your_user_id_here
```

**Finding your league ID:** Open your league in the Sleeper web app — the URL contains a long numeric league ID (e.g. `sleeper.com/leagues/1234567890123456789/team`).

**Finding your user ID:** Visit `https://api.sleeper.app/v1/user/<your_sleeper_username>` in a browser and copy the `user_id` field from the response.

## Running the server

```bash
node index.js
```

The server communicates over stdio and is meant to be launched by an MCP client, not run standalone for interactive use.

## Connecting to Claude Desktop

Add an entry to your Claude Desktop MCP config file (typically `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "sleeper": {
      "command": "node",
      "args": ["/full/path/to/sleeper-mcp-server/index.js"]
    }
  }
}
```

Restart Claude Desktop after saving. Verify the connection by asking Claude to check your league settings.

## Available tools

| Tool | Purpose |
|---|---|
| `get_league_settings` | League info, roster positions, current status |
| `get_rosters` | All rosters in the league |
| `get_league_users` | League members and team names |
| `get_matchups` | Weekly matchup data |
| `get_transactions` | Waiver/trade activity for a given week |
| `get_traded_picks` | Draft picks that have been traded |
| `get_nfl_state` | Current NFL week/season info |
| `get_draft_picks` | Picks made in a given draft |
| `get_draft_traded_picks` | Traded picks specific to a draft |
| `get_trending` | Trending adds/drops across Sleeper |
| `draft_status` | **Bundled** — live draft board state + available players + your needs |
| `roster_needs` | **Bundled** — in-season roster gap analysis |

## Before each draft

Refresh `fallback_rankings.json` with a current top-100-ish player list before your draft. This is only used if live data becomes unreachable — it's a safety net, not the primary data source.

## Updating for a new season

Sleeper issues a new league ID each season (linked to the prior one via `previous_league_id`). Update `SLEEPER_LEAGUE_ID` in your `.env` file each year — no code changes needed.

## Limitations

- Read-only — cannot set lineups, process waivers, or submit trades
- Single league per configuration (not built for multi-league use)
- Player database is refetched fresh on every server start (no disk cache)
- Rankings/ADP are not sourced from Sleeper (not reliably available) — live draft/season advice relies on web search plus this server's league data

## License
