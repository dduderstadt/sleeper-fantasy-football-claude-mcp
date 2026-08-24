import { getPlayers } from './sleeperClient.js';

// Sleeper asks that /players/nfl not be polled more than once a day.
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Sleeper's placeholder for an empty starter slot — not a real player_id.
const EMPTY_SLOT_ID = '0';

// Team defenses are drafted/started as a unit, so players/starters arrays
// carry the team code itself (e.g. "DET") instead of a numeric player_id.
// Sleeper's /players/nfl payload does include a DEF entry per team, but
// this map lets resolveOne() give a sensible name even if that entry is
// ever missing/stale in the cache.
const NFL_TEAM_NAMES = {
  ARI: 'Arizona Cardinals',
  ATL: 'Atlanta Falcons',
  BAL: 'Baltimore Ravens',
  BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers',
  CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals',
  CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys',
  DEN: 'Denver Broncos',
  DET: 'Detroit Lions',
  GB: 'Green Bay Packers',
  HOU: 'Houston Texans',
  IND: 'Indianapolis Colts',
  JAX: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs',
  LAC: 'Los Angeles Chargers',
  LAR: 'Los Angeles Rams',
  LV: 'Las Vegas Raiders',
  MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings',
  NE: 'New England Patriots',
  NO: 'New Orleans Saints',
  NYG: 'New York Giants',
  NYJ: 'New York Jets',
  PHI: 'Philadelphia Eagles',
  PIT: 'Pittsburgh Steelers',
  SEA: 'Seattle Seahawks',
  SF: 'San Francisco 49ers',
  TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans',
  WAS: 'Washington Commanders',
};

// Same set draft_status groups undrafted players by.
const FANTASY_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const FALLBACK_TOP_N_OVERALL = 100;
const FALLBACK_TOP_N_PER_POSITION = 5;

function playerName(p) {
  return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null;
}

function toRankedEntry(playerId, p) {
  return {
    player_id: playerId,
    name: playerName(p),
    position: p.position,
    team: p.team,
    search_rank: p.search_rank ?? Infinity,
  };
}

/**
 * Derived automatically from the player database on every successful
 * refresh — top players by Sleeper's own `search_rank` field overall, and
 * per position. This is a rough search-relevance signal Sleeper assigns
 * (lower = more prominent), not a curated fantasy ranking or ADP; every
 * caller of getFallbackRankings() should label it as such. Used as a
 * last-resort fallback (draft_status) when live picks/roster data can't be
 * fetched — there's no manual file to keep up to date, since this is
 * recomputed from the same data every ~24h refresh.
 */
function computeFallbackRankings(playersObj) {
  const eligible = Object.entries(playersObj)
    .filter(([, p]) => p.team && FANTASY_POSITIONS.includes(p.position))
    .map(([playerId, p]) => toRankedEntry(playerId, p));

  eligible.sort((a, b) => a.search_rank - b.search_rank);

  const topByPosition = {};
  for (const position of FANTASY_POSITIONS) {
    topByPosition[position] = eligible
      .filter((p) => p.position === position)
      .slice(0, FALLBACK_TOP_N_PER_POSITION)
      .map(({ player_id, name, team }) => ({ player_id, name, team }));
  }

  return {
    top_100_overall: eligible.slice(0, FALLBACK_TOP_N_OVERALL).map(({ player_id, name, position, team }) => ({
      player_id,
      name,
      position,
      team,
    })),
    top_5_by_position: topByPosition,
  };
}

let players = {};
let fallbackRankings = { top_100_overall: [], top_5_by_position: {} };
let readyPromise = null;

async function refresh() {
  try {
    const fetched = await getPlayers();
    players = fetched;
    fallbackRankings = computeFallbackRankings(players);
    console.log(`Player cache loaded: ${Object.keys(players).length} players`);
  } catch (error) {
    // Never let a failed refresh wipe out good data already in memory —
    // keep serving whatever we last successfully loaded (players AND the
    // fallback rankings derived from it).
    console.error('Player cache refresh failed, keeping previous data:', error);
  }
}

/**
 * Kicks off the initial player database fetch and schedules a refresh
 * roughly once every 24 hours for the life of the process. Call once at
 * server startup. Does not block the caller — app.listen()/`/health`
 * should come up immediately regardless of how long this fetch takes;
 * tools that need player data await `resolvePlayers` instead, which
 * waits on this same initial load.
 */
export function initPlayerCache() {
  readyPromise = refresh();
  setInterval(refresh, REFRESH_INTERVAL_MS).unref();
  return readyPromise;
}

function resolveOne(rawPlayerId) {
  // Sleeper's IDs are strings everywhere (player_id, team defense codes,
  // the "0" empty-slot sentinel). Normalize explicitly rather than assume
  // the caller already has a string — a stray number here would silently
  // fail the "0" check and the players[id] lookup otherwise.
  const playerId = String(rawPlayerId);

  const empty = { status: null, injury_status: null, years_exp: null, fantasy_positions: null };

  if (playerId === EMPTY_SLOT_ID) {
    return { player_id: playerId, name: 'Empty slot', position: null, team: null, ...empty };
  }

  const p = players[playerId];
  if (p) {
    const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null;
    return {
      player_id: playerId,
      name,
      position: p.position ?? null,
      team: p.team ?? null,
      status: p.status ?? null,
      injury_status: p.injury_status ?? null,
      years_exp: p.years_exp ?? null,
      fantasy_positions: p.fantasy_positions ?? null,
    };
  }

  // Not a real numeric player_id and not found in the cache — check
  // whether it's a team defense code (e.g. "DET") before giving up.
  const teamName = NFL_TEAM_NAMES[playerId];
  if (teamName) {
    return { player_id: playerId, name: teamName, position: 'DEF', team: playerId, ...empty, fantasy_positions: ['DEF'] };
  }

  return { player_id: playerId, name: null, position: null, team: null, ...empty };
}

/**
 * Resolves a player_id, or an array of player_ids, to readable info
 * (name, position, team) from the in-memory player cache. Awaits the
 * initial load if it hasn't finished yet. Unknown IDs resolve to nulls
 * rather than throwing, since Sleeper data can reference retired/invalid
 * IDs (e.g. an empty roster slot).
 */
export async function resolvePlayers(idOrIds) {
  if (readyPromise) await readyPromise;

  if (Array.isArray(idOrIds)) {
    return idOrIds.map(resolveOne);
  }
  return resolveOne(idOrIds);
}

/**
 * Returns the raw in-memory player cache (player_id -> Sleeper player
 * object), awaiting the initial load if needed. For callers that need to
 * scan/count across the whole player pool (e.g. counting undrafted players
 * per position) — never fetches over the network itself, so it's safe to
 * call as often as needed without touching Sleeper's once-a-day guidance.
 */
export async function getCachedPlayers() {
  if (readyPromise) await readyPromise;
  return players;
}

/**
 * Returns the current fallback ranking snapshot: { top_100_overall,
 * top_5_by_position }, derived from Sleeper's search_rank field on the
 * last successful player database refresh. Never fetches over the
 * network. Empty arrays mean the player cache itself has never
 * successfully loaded (e.g. first request racing a still-in-flight or
 * failed initial fetch) — callers should treat that as "no fallback data
 * available either," not as "zero players exist."
 */
export async function getFallbackRankings() {
  if (readyPromise) await readyPromise;
  return fallbackRankings;
}
