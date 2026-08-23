import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';

import { config } from './config.js';
import { bearerAuth } from './auth.js';
import { registerTools } from './tools.js';

function buildMcpServer() {
  const server = new McpServer({
    name: 'sleeper-fantasy-football-mcp',
    version: '1.0.0',
  });

  registerTools(server, { leagueId: config.sleeperLeagueId });

  return server;
}

// Binding to 0.0.0.0 to be reachable from Railway's router disables the SDK's
// built-in localhost DNS-rebinding checks (Host header can legitimately be
// anything once this is on the public internet). The bearer token check
// below is the real access control for this server.
const app = createMcpExpressApp({ host: '0.0.0.0' });

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/mcp', bearerAuth(config.mcpAuthToken));

// Stateless mode: a fresh McpServer + transport per request. Simple to
// reason about and fine for a single-league, low-traffic tool server;
// there's no session state to manage or lose across Railway restarts.
app.post('/mcp', async (req, res) => {
  try {
    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

// Streamable HTTP defines GET (server-initiated streams) and DELETE
// (session teardown) too, but this server runs stateless, so neither
// applies — respond the same way the SDK's own stateless example does.
function methodNotAllowed(req, res) {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  });
}
app.get('/mcp', methodNotAllowed);
app.delete('/mcp', methodNotAllowed);

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Sleeper MCP server listening on port ${config.port}`);
});
