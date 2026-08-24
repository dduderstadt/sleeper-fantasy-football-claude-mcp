# Refactor Plan

## Phase 0 — Scaffolding

[] Add typescript, tsx (or ts-node) and @types/express, @types/cors as devDependencies.

[] tsconfig.json: strict: true, module: NodeNext, target: ES2022 (matches your Node 24 pin), outDir: dist.
[] Update package.json: main: dist/server.js, build: tsc, start: node dist/server.js, dev: tsx watch src/server.ts.
[] Railway build command becomes npm run build && npm start. Add dist/ to .gitignore.

## Phase 1 — Shared types first
Create src/types.ts with the domain shapes the README already implies:

[] ResolvedPlayer (player_id, name, position, team, status, injury_status, years_exp, fantasy_positions)
[] RosterSlot, FillStatus ("solid" | "questionable" | "empty")
[] DraftStatusResult as a discriminated union on fallback_mode: true | false — this is the single biggest type-safety win in the whole repo, since it forces every consumer to null-check the right fields instead of trusting a loose object.
[] PerformanceWeek (as a union: normal week vs. { week, bye: true })
[] Config (the shape config.js currently returns)

## Phase 2 — Convert leaf modules (no internal deps)
In order: config.js → config.ts, flexEligibility.js → flexEligibility.ts, sleeperClient.js → sleeperClient.ts. sleeperClient is worth doing carefully — make sleeperFetch<T>() generic so every caller gets a typed return instead of any, and type the three distinct error cases (timeout / network / non-2xx) as a small union or tagged error classes.

## Phase 3 — Data-shaping modules
[] playerCache.ts, watchlist.ts, recentPerformance.ts, rosterNeeds.ts, draftStatus.ts — these now import typed functions from Phase 2, so the compiler starts doing real work catching mismatches (e.g. anywhere a raw player_id string leaked into a spot expecting ResolvedPlayer).

## Phase 4 — Entry points

[] auth.ts: type the Express middleware as (req: Request, res: Response, next: NextFunction) => void.
[] tools.ts: define each tool’s zod schema once and derive its arg type with z.infer<typeof schema> instead of hand-writing a parallel TS type — one source of truth for validation and typing.
[] server.ts last, since it just wires everything else together.

## Phase 5 — Tighten up

[] Turn on noUncheckedIndexedAccess (catches the player_id string lookups against the player-cache map).
[] Add eslint + typescript-eslint.
[] Update the README’s project-structure block and “adding a new tool” instructions to say .ts.