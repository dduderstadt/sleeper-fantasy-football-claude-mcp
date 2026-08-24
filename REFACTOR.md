# TypeScript Refactor Roadmap — Sleeper MCP Server

The project splits into small, focused files already, which makes this an easy migration: convert the simplest files first, then work up to the files that depend on them.

## Phase 0 — Setup

- [ ] Add TypeScript and dev tools to the project
- [ ] Add a `tsconfig.json` (project settings) with strict type-checking turned on
- [ ] Update build/run scripts so `npm run build` compiles TS to JS, and `npm start` runs the compiled output
- [ ] Update Railway's build step to run the compile before starting the server
- [ ] Ignore the compiled output folder in git

## Phase 1 — Define the shared shapes

- [ ] Create one file listing the core data shapes used across the app (a player, a roster slot, a draft result, a performance week, etc.)
- [ ] Make the draft status result explicit about its two modes (normal vs. fallback) so the rest of the code can't accidentally mix them up

## Phase 2 — Convert the simplest files first

- [ ] Convert the config file (reads environment variables)
- [ ] Convert the flex-eligibility file (roster slot logic)
- [ ] Convert the Sleeper API client (the file every network call goes through)
- [ ] Make sure the API client returns typed data instead of untyped, so mistakes get caught automatically later

## Phase 3 — Convert the data-processing files

- [ ] Convert the player cache
- [ ] Convert the watchlist reader
- [ ] Convert the recent-performance calculator
- [ ] Convert the roster-needs checker
- [ ] Convert the draft-status bundler

## Phase 4 — Convert the entry points

- [ ] Convert the auth/security check
- [ ] Convert the tool definitions (the part Claude actually calls) — reuse the existing validation rules so the types and the validation can't drift apart
- [ ] Convert the main server file last, since it ties everything else together

## Phase 5 — Polish

- [ ] Turn on stricter checks for unsafe lookups (e.g. looking up a player that might not exist)
- [ ] Add a linter for consistent style and catching common mistakes
- [ ] Update the README's file list and instructions to reflect the new file extensions
