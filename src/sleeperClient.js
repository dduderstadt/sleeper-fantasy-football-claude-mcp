const SLEEPER_API_BASE = 'https://api.sleeper.app/v1';
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Every Sleeper call in this codebase goes through here, so every one of
 * them gets the same treatment: a hard timeout (a hung connection would
 * otherwise hang the calling tool indefinitely — MCP's SDK already turns a
 * thrown Error into a clean isError tool result, but only once something
 * actually throws), and a message that says clearly which of three things
 * went wrong (timeout / network failure / non-2xx response) rather than a
 * generic failure.
 */
async function sleeperFetch(path, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const url = `${SLEEPER_API_BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Sleeper API request to ${path} timed out after ${timeoutMs / 1000}s`);
    }
    throw new Error(`Sleeper API network error fetching ${path}: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Sleeper API error fetching ${path}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetches a league's core record from Sleeper, including its current
 * `draft_id` — Sleeper issues a new draft_id each season, so this must
 * always be read live rather than cached in config.
 */
export function getLeague(leagueId) {
  return sleeperFetch(`/league/${leagueId}`);
}

export function getRosters(leagueId) {
  return sleeperFetch(`/league/${leagueId}/rosters`);
}

export function getLeagueUsers(leagueId) {
  return sleeperFetch(`/league/${leagueId}/users`);
}

export function getMatchups(leagueId, week) {
  return sleeperFetch(`/league/${leagueId}/matchups/${week}`);
}

export function getTransactions(leagueId, round) {
  return sleeperFetch(`/league/${leagueId}/transactions/${round}`);
}

export function getTradedPicks(leagueId) {
  return sleeperFetch(`/league/${leagueId}/traded_picks`);
}

export function getNflState() {
  return sleeperFetch('/state/nfl');
}

/**
 * Fetches a draft's own record — status, round settings, and
 * slot_to_roster_id (which roster sits in which snake-draft slot).
 * Not exposed as its own MCP tool; used internally by draft_status
 * to compute pick order.
 */
export function getDraft(draftId) {
  return sleeperFetch(`/draft/${draftId}`);
}

export function getDraftPicks(draftId) {
  return sleeperFetch(`/draft/${draftId}/picks`);
}

export function getDraftTradedPicks(draftId) {
  return sleeperFetch(`/draft/${draftId}/traded_picks`);
}

/**
 * Fetches Sleeper's full NFL player database, keyed by player_id. This is a
 * large (~5MB) payload; Sleeper asks that it not be polled more than once a
 * day, so callers should cache the result rather than calling this per
 * request — see playerCache.js.
 */
export function getPlayers() {
  // Larger timeout: this is a ~5MB payload, unlike every other call here.
  return sleeperFetch('/players/nfl', { timeoutMs: 30_000 });
}

export function getTrending(type, lookbackHours, limit) {
  const params = new URLSearchParams();
  if (lookbackHours !== undefined) params.set('lookback_hours', String(lookbackHours));
  if (limit !== undefined) params.set('limit', String(limit));
  const query = params.toString();
  return sleeperFetch(`/players/nfl/trending/${type}${query ? `?${query}` : ''}`);
}
