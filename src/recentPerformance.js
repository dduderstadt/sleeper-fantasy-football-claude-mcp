import { getLeague, getNflState, getWeekStats } from './sleeperClient.js';
import { resolvePlayers, getCachedPlayers } from './playerCache.js';

const MAX_WEEKS_BACK = 4;
const DEFAULT_WEEKS_BACK = 4;

// Best-known mapping from Sleeper's raw weekly stat keys (GET
// /stats/nfl/regular/<season>/<week>) to the usage indicators this tool
// surfaces. Sleeper doesn't publish a fixed schema for these, and this
// sandbox can't reach api.sleeper.app to confirm them against a live
// response -- verify with a real call after deploying and flag anything
// that doesn't map cleanly. Fantasy point computation doesn't depend on
// this map (it sums directly against scoring_settings' own keys), so only
// these usage fields are at risk if the real key names differ.
const USAGE_STAT_KEYS = {
  targets: 'rec_tgt',
  carries: 'rush_att',
  receptions: 'rec',
  snaps: 'off_snp',
  teamSnaps: 'tm_off_snp',
};

function computeFantasyPoints(rawStats, scoringSettings) {
  let points = 0;
  for (const [statKey, weight] of Object.entries(scoringSettings)) {
    const value = rawStats[statKey];
    if (typeof weight === 'number' && typeof value === 'number') {
      points += weight * value;
    }
  }
  return Math.round(points * 100) / 100;
}

function extractUsage(rawStats) {
  const usage = {};
  if (typeof rawStats[USAGE_STAT_KEYS.targets] === 'number') usage.targets = rawStats[USAGE_STAT_KEYS.targets];
  if (typeof rawStats[USAGE_STAT_KEYS.carries] === 'number') usage.carries = rawStats[USAGE_STAT_KEYS.carries];
  if (typeof rawStats[USAGE_STAT_KEYS.receptions] === 'number') usage.receptions = rawStats[USAGE_STAT_KEYS.receptions];

  const snaps = rawStats[USAGE_STAT_KEYS.snaps];
  if (typeof snaps === 'number') {
    usage.snaps = snaps;
    const teamSnaps = rawStats[USAGE_STAT_KEYS.teamSnaps];
    if (typeof teamSnaps === 'number' && teamSnaps > 0) {
      usage.snap_pct = Math.round((snaps / teamSnaps) * 1000) / 10;
    }
  }
  return usage;
}

/**
 * A team with zero players appearing anywhere in a given week's stats
 * response is presumed to have been on a bye that week. Sleeper's stats
 * endpoint has no explicit bye flag, so this infers it from the same
 * response rather than a separate schedule lookup -- cheap since the full
 * player cache is already in memory.
 */
function computeByeTeams(weekStats, players) {
  const teamsWithData = new Set();
  for (const playerId of Object.keys(weekStats)) {
    const team = players[playerId]?.team;
    if (team) teamsWithData.add(team);
  }

  const byeTeams = new Set();
  for (const p of Object.values(players)) {
    if (p.team && !teamsWithData.has(p.team)) byeTeams.add(p.team);
  }
  return byeTeams;
}

/**
 * Computes recent actual game performance (fantasy points + usage) for a
 * batch of players, using the league's real scoring_settings. Fetches
 * Sleeper's weekly stats endpoint once per completed week -- never once
 * per player -- so an entire roster costs at most `weeksBack` (<= 4)
 * Sleeper calls total, regardless of how many playerIds are passed.
 *
 * Only completed weeks are ever included; the current in-progress week's
 * stats aren't final and are always excluded. If fewer than weeksBack
 * completed weeks exist yet this season, whatever is actually available is
 * returned instead (down to zero for week 1). A week with genuinely no
 * data for a player (not yet on a roster, hasn't debuted) is simply
 * omitted from that player's weeks array rather than shown as a
 * fabricated zero; a bye week is flagged explicitly instead.
 */
export async function getRecentPerformance({ leagueId, playerIds, weeksBack = DEFAULT_WEEKS_BACK }) {
  const clampedWeeksBack = Math.min(weeksBack, MAX_WEEKS_BACK);

  const [league, state] = await Promise.all([getLeague(leagueId), getNflState()]);
  const scoringSettings = league.scoring_settings ?? {};
  const season = state.season;
  const currentWeek = state.week ?? 0;

  const completedWeeks = [];
  for (let w = currentWeek - 1; w >= 1 && completedWeeks.length < clampedWeeksBack; w--) {
    completedWeeks.push(w);
  }
  completedWeeks.reverse();

  const statsByWeek = new Map();
  if (completedWeeks.length > 0) {
    const fetched = await Promise.all(completedWeeks.map((week) => getWeekStats(season, week)));
    completedWeeks.forEach((week, i) => statsByWeek.set(week, fetched[i] ?? {}));
  }

  const players = await getCachedPlayers();
  const byeTeamsByWeek = new Map();
  for (const week of completedWeeks) {
    byeTeamsByWeek.set(week, computeByeTeams(statsByWeek.get(week), players));
  }

  const resolved = await resolvePlayers(playerIds);

  return playerIds.map((playerId, i) => {
    const info = resolved[i];
    const weeks = [];

    for (const week of completedWeeks) {
      const raw = statsByWeek.get(week)[playerId];
      if (raw) {
        weeks.push({
          week,
          fantasy_points: computeFantasyPoints(raw, scoringSettings),
          usage: extractUsage(raw),
        });
      } else if (info.team && byeTeamsByWeek.get(week).has(info.team)) {
        weeks.push({ week, bye: true });
      }
    }

    return {
      player_id: playerId,
      name: info.name,
      position: info.position,
      team: info.team,
      weeks,
    };
  });
}
