const SLEEPER_API_BASE = 'https://api.sleeper.app/v1';

/**
 * Fetches a league's core record from Sleeper, including its current
 * `draft_id` — Sleeper issues a new draft_id each season, so this must
 * always be read live rather than cached in config.
 */
export async function getLeague(leagueId) {
  const url = `${SLEEPER_API_BASE}/league/${leagueId}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Sleeper API error fetching league ${leagueId}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
