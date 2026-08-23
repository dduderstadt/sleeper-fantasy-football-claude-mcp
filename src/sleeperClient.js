const SLEEPER_API_BASE = 'https://api.sleeper.app/v1';

async function sleeperFetch(path) {
  const url = `${SLEEPER_API_BASE}${path}`;
  const response = await fetch(url);

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

export function getDraftPicks(draftId) {
  return sleeperFetch(`/draft/${draftId}/picks`);
}

export function getDraftTradedPicks(draftId) {
  return sleeperFetch(`/draft/${draftId}/traded_picks`);
}

export function getTrending(type, lookbackHours, limit) {
  const params = new URLSearchParams();
  if (lookbackHours !== undefined) params.set('lookback_hours', String(lookbackHours));
  if (limit !== undefined) params.set('limit', String(limit));
  const query = params.toString();
  return sleeperFetch(`/players/nfl/trending/${type}${query ? `?${query}` : ''}`);
}
