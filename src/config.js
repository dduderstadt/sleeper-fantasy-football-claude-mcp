import 'dotenv/config';

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in (see README).`
    );
  }
  return value;
}

export const config = {
  sleeperLeagueId: requireEnv('SLEEPER_LEAGUE_ID'),
  sleeperUserId: requireEnv('SLEEPER_USER_ID'),
  mcpAuthToken: requireEnv('MCP_AUTH_TOKEN'),
  port: Number(process.env.PORT) || 3000,
};
