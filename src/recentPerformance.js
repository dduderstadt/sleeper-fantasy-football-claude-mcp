import { getLeague, getNflState, getWeekStats } from './sleeperClient.js';
import { resolvePlayers, getCachedPlayers } from './playerCache.js';

const MAX_WEEKS_BACK = 4;
const DEFAULT_WEEKS_BACK = 4;

// A genuinely completed week has stats for the vast majority of the
// league's 32 teams -- a real bye week affects only a handful at once.
// Fewer than this many teams represented means the response didn't
// actually carry real data for that week (stats not posted yet, wrong
// week number for the season type, etc.), not "everyone's on bye" --
// see computeByeTeams().
const MIN_TEAMS_FOR_VALID_WEEK = 20;

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

function teamsWithDataInWeek(weekStats, players) {
  const teams = new Set();
  for (const playerId of Object.keys(weekStats)) {
    const team = players[playerId]?.team;
    if (team) teams.add(team);
  }
  return teams;
}

/**
 * A team with zero players appearing anywhere in a given week's stats
 * response is presumed to have been on a bye that week. Sleeper's stats
 * endpoint has no explicit bye flag, so this infers it from the same
 * response rather than a separate schedule lookup -- cheap since the full
 * player cache is already in memory. Only call this once teamsWithData has
 * already cleared MIN_TEAMS_FOR_VALID_WEEK -- otherwise "nobody has data"
 * (a bad/empty week response) gets misread as "everybody's on bye."
 */
function computeByeTeams(teamsWithData, players) {
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
 * returned instead (down to zero for week 1, and always zero outside
 * season_type "regular" -- see below). A week with genuinely no data for a
 * player (not yet on a roster, hasn't debuted) is simply omitted from that
 * player's weeks array rather than shown as a fabricated zero; a bye week
 * is flagged explicitly instead.
 */
export async function getRecentPerformance({ leagueId, playerIds, weeksBack = DEFAULT_WEEKS_BACK }) {
  const clampedWeeksBack = Math.min(weeksBack, MAX_WEEKS_BACK);

  const [league, state] = await Promise.all([getLeague(leagueId), getNflState()]);
  const scoringSettings = league.scoring_settings ?? {};
  const season = state.season;
  const currentWeek = state.week ?? 0;

  // /stats/nfl/regular/<season>/<week> only has real data once the regular
  // season is underway. During preseason (season_type "pre"), state.week
  // counts preseason weeks, not regular season ones, so those numbers
  // don't correspond to anything on the regular-season stats endpoint at
  // all -- querying it anyway returns an empty response for every team,
  // not "everyone's on bye." Outside season_type "regular", there are no
  // completed regular-season weeks to report, so this returns zero rather
  // than calling the endpoint with numbers that don't apply to it.
  const completedWeeks = [];
  if (state.season_type === 'regular') {
    for (let w = currentWeek - 1; w >= 1 && completedWeeks.length < clampedWeeksBack; w--) {
      completedWeeks.push(w);
    }
    completedWeeks.reverse();
  }

  const statsByWeek = new Map();
  if (completedWeeks.length > 0) {
    const fetched = await Promise.all(completedWeeks.map((week) => getWeekStats(season, week)));
    completedWeeks.forEach((week, i) => statsByWeek.set(week, fetched[i] ?? {}));
  }

  const players = await getCachedPlayers();

  // null for a week means its response didn't clear MIN_TEAMS_FOR_VALID_WEEK
  // -- treated as "no usable data for this week," never as bye evidence.
  const byeTeamsByWeek = new Map();
  for (const week of completedWeeks) {
    const teamsWithData = teamsWithDataInWeek(statsByWeek.get(week), players);
    byeTeamsByWeek.set(week, teamsWithData.size >= MIN_TEAMS_FOR_VALID_WEEK ? computeByeTeams(teamsWithData, players) : null);
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
      } else {
        const byeTeams = byeTeamsByWeek.get(week);
        if (byeTeams && info.team && byeTeams.has(info.team)) {
          weeks.push({ week, bye: true });
        }
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
