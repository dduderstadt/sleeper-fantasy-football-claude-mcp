import { getLeague } from './sleeperClient.js';

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

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
