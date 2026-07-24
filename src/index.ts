#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { EnvCookieAuth, SessionFileAuth, type AuthProvider } from "./auth.js";
import { MitpClient } from "./client.js";
import { registerTools } from "./tools.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const host = new URL(cfg.baseUrl).host;

  const auth: AuthProvider = cfg.cookieOverride
    ? new EnvCookieAuth(cfg.cookieOverride)
    : new SessionFileAuth(cfg.sessionPath, host);

  const client = new MitpClient(cfg, auth);

  const server = new McpServer({
    name: "mitp-mcp-server",
    version: "0.1.0",
  });

  registerTools(server, client, cfg);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // NOTE: stdout is reserved for the MCP protocol — log to stderr only.
  console.error(
    `[mitp-mcp] connected  base=${cfg.baseUrl}  app=${cfg.app}  auth=${auth.describe()}  readOnly=${cfg.readOnly}`,
  );
}

main().catch((err) => {
  console.error("[mitp-mcp] fatal:", err);
  process.exit(1);
});
