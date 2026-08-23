import { z } from 'zod';
import {
  getLeague,
  getRosters,
  getLeagueUsers,
  getMatchups,
  getTransactions,
  getTradedPicks,
  getNflState,
  getDraftPicks,
  getDraftTradedPicks,
  getTrending,
} from './sleeperClient.js';
import { resolvePlayers } from './playerCache.js';

function jsonResult(data) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

const resolvePlayersSchema = z
  .boolean()
  .optional()
  .describe('If true, add resolved name/position/team fields alongside raw player_ids. Default false.');

// Resolves each array-valued player_id field present on `obj` (e.g. a
// roster's `players`/`starters`/`reserve`/`taxi`) into a sibling
// `<field>_resolved` field, leaving the raw arrays untouched.
async function attachResolvedPlayerArrays(obj, fields) {
  for (const field of fields) {
    if (Array.isArray(obj[field])) {
      obj[`${field}_resolved`] = await resolvePlayers(obj[field]);
    }
  }
}

/**
 * Registers all MCP tools on the given server instance.
 * `leagueId` is injected from config rather than exposed as a tool
 * argument, since this server is scoped to a single league.
 */
export function registerTools(server, { leagueId }) {
  server.registerTool(
    'get_league_settings',
    {
      title: 'Get League Settings',
      description:
        "Fetches the configured Sleeper league's settings, roster positions, status, and current draft_id. " +
        'The draft_id changes every season and is always read live from Sleeper, never cached.',
    },
    async () => {
      const league = await getLeague(leagueId);

      const result = {
        league_id: league.league_id,
        name: league.name,
        season: league.season,
        status: league.status,
        sport: league.sport,
        settings: league.settings,
        roster_positions: league.roster_positions,
        draft_id: league.draft_id,
      };

      return jsonResult(result);
    }
  );

  server.registerTool(
    'get_rosters',
    {
      title: 'Get Rosters',
      description:
        'Fetches all rosters in the configured Sleeper league (raw Sleeper API response). ' +
        'Optionally resolves player_ids in players/starters/reserve/taxi to names/positions/teams.',
      inputSchema: {
        resolve_players: resolvePlayersSchema,
      },
    },
    async ({ resolve_players }) => {
      const rosters = await getRosters(leagueId);
      if (resolve_players) {
        for (const roster of rosters) {
          await attachResolvedPlayerArrays(roster, ['players', 'starters', 'reserve', 'taxi']);
        }
      }
      return jsonResult(rosters);
    }
  );

  server.registerTool(
    'get_league_users',
    {
      title: 'Get League Users',
      description: "Fetches all users (team owners) in the configured Sleeper league (raw Sleeper API response).",
    },
    async () => jsonResult(await getLeagueUsers(leagueId))
  );

  server.registerTool(
    'get_matchups',
    {
      title: 'Get Matchups',
      description:
        'Fetches matchups for a given week of the configured Sleeper league (raw Sleeper API response). ' +
        'Optionally resolves player_ids in players/starters to names/positions/teams.',
      inputSchema: {
        week: z.number().int().positive().describe('NFL week number, e.g. 1-18'),
        resolve_players: resolvePlayersSchema,
      },
    },
    async ({ week, resolve_players }) => {
      const matchups = await getMatchups(leagueId, week);
      if (resolve_players) {
        for (const matchup of matchups) {
          await attachResolvedPlayerArrays(matchup, ['players', 'starters']);
        }
      }
      return jsonResult(matchups);
    }
  );

  server.registerTool(
    'get_transactions',
    {
      title: 'Get Transactions',
      description:
        'Fetches waiver/trade transactions for a given round of the configured Sleeper league (raw Sleeper API response). ' +
        'Round is the week number in a standard league, or the round number in a best ball league. ' +
        'Optionally resolves player_ids in adds/drops to names/positions/teams.',
      inputSchema: {
        round: z.number().int().positive().describe('Transaction round (week number in a standard league)'),
        resolve_players: resolvePlayersSchema,
      },
    },
    async ({ round, resolve_players }) => {
      const transactions = await getTransactions(leagueId, round);
      if (resolve_players) {
        for (const transaction of transactions) {
          for (const field of ['adds', 'drops']) {
            if (transaction[field]) {
              const ids = Object.keys(transaction[field]);
              const resolved = await resolvePlayers(ids);
              transaction[`${field}_resolved`] = ids.map((id, i) => ({
                ...resolved[i],
                roster_id: transaction[field][id],
              }));
            }
          }
        }
      }
      return jsonResult(transactions);
    }
  );

  server.registerTool(
    'get_traded_picks',
    {
      title: 'Get Traded Picks',
      description: 'Fetches all traded draft picks for the configured Sleeper league (raw Sleeper API response).',
    },
    async () => jsonResult(await getTradedPicks(leagueId))
  );

  server.registerTool(
    'get_nfl_state',
    {
      title: 'Get NFL State',
      description: 'Fetches the current NFL season/week state from Sleeper (raw Sleeper API response).',
    },
    async () => jsonResult(await getNflState())
  );

  server.registerTool(
    'get_draft_picks',
    {
      title: 'Get Draft Picks',
      description:
        'Fetches all picks made so far in a given Sleeper draft (raw Sleeper API response). ' +
        'draft_id is not configured statically — get it live from get_league_settings first. ' +
        'Optionally resolves each pick\'s player_id to name/position/team.',
      inputSchema: {
        draft_id: z.string().describe('Sleeper draft_id, from get_league_settings'),
        resolve_players: resolvePlayersSchema,
      },
    },
    async ({ draft_id, resolve_players }) => {
      const picks = await getDraftPicks(draft_id);
      if (resolve_players) {
        for (const pick of picks) {
          if (pick.player_id) {
            pick.player_resolved = await resolvePlayers(pick.player_id);
          }
        }
      }
      return jsonResult(picks);
    }
  );

  server.registerTool(
    'get_draft_traded_picks',
    {
      title: 'Get Draft Traded Picks',
      description:
        'Fetches traded picks specific to a given Sleeper draft (raw Sleeper API response). ' +
        'draft_id is not configured statically — get it live from get_league_settings first.',
      inputSchema: {
        draft_id: z.string().describe('Sleeper draft_id, from get_league_settings'),
      },
    },
    async ({ draft_id }) => jsonResult(await getDraftTradedPicks(draft_id))
  );

  server.registerTool(
    'get_trending',
    {
      title: 'Get Trending Players',
      description:
        'Fetches trending NFL players being added or dropped across Sleeper (raw Sleeper API response). ' +
        'Optionally resolves each entry\'s player_id to name/position/team.',
      inputSchema: {
        type: z.enum(['add', 'drop']).describe('Whether to fetch trending adds or drops'),
        lookback_hours: z.number().int().positive().optional().describe('Hours to look back (Sleeper default: 24)'),
        limit: z.number().int().positive().optional().describe('Max number of players to return (Sleeper default: 25)'),
        resolve_players: resolvePlayersSchema,
      },
    },
    async ({ type, lookback_hours, limit, resolve_players }) => {
      const trending = await getTrending(type, lookback_hours, limit);
      if (resolve_players) {
        const ids = trending.map((entry) => entry.player_id);
        const resolved = await resolvePlayers(ids);
        trending.forEach((entry, i) => {
          entry.player_resolved = resolved[i];
        });
      }
      return jsonResult(trending);
    }
  );
}
