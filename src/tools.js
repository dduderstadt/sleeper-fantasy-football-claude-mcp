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
      description: "Fetches all rosters in the configured Sleeper league (raw Sleeper API response).",
    },
    async () => jsonResult(await getRosters(leagueId))
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
      description: 'Fetches matchups for a given week of the configured Sleeper league (raw Sleeper API response).',
      inputSchema: {
        week: z.number().int().positive().describe('NFL week number, e.g. 1-18'),
      },
    },
    async ({ week }) => jsonResult(await getMatchups(leagueId, week))
  );

  server.registerTool(
    'get_transactions',
    {
      title: 'Get Transactions',
      description:
        'Fetches waiver/trade transactions for a given round of the configured Sleeper league (raw Sleeper API response). ' +
        'Round is the week number in a standard league, or the round number in a best ball league.',
      inputSchema: {
        round: z.number().int().positive().describe('Transaction round (week number in a standard league)'),
      },
    },
    async ({ round }) => jsonResult(await getTransactions(leagueId, round))
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
        'draft_id is not configured statically — get it live from get_league_settings first.',
      inputSchema: {
        draft_id: z.string().describe('Sleeper draft_id, from get_league_settings'),
      },
    },
    async ({ draft_id }) => jsonResult(await getDraftPicks(draft_id))
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
      description: 'Fetches trending NFL players being added or dropped across Sleeper (raw Sleeper API response).',
      inputSchema: {
        type: z.enum(['add', 'drop']).describe('Whether to fetch trending adds or drops'),
        lookback_hours: z.number().int().positive().optional().describe('Hours to look back (Sleeper default: 24)'),
        limit: z.number().int().positive().optional().describe('Max number of players to return (Sleeper default: 25)'),
      },
    },
    async ({ type, lookback_hours, limit }) => jsonResult(await getTrending(type, lookback_hours, limit))
  );
}
