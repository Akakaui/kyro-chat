import { Client } from '@modelcontextprotocol/sdk/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';

export interface MCPServerConfig {
  id: string;
  userId: string;
  name: string;
  url: string;
  authType: 'none' | 'oauth' | 'api_key' | 'bearer';
  accessToken?: string;
  apiKey?: string;
  status: 'connected' | 'disconnected' | 'error';
  toolsJson?: string;
}

export interface MCPToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export class MCPClient {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StreamableHTTPClientTransport> = new Map();
  private toolCache: Map<string, MCPToolInfo[]> = new Map();

  /**
   * Connect to a remote MCP server via Streamable HTTP transport.
   * Returns the list of available tool names.
   */
  async connect(server: MCPServerConfig): Promise<MCPToolInfo[]> {
    // Close existing connection if any
    await this.disconnect(server.id);

    const transport = new StreamableHTTPClientTransport(
      new URL(server.url),
      {
        requestInit: {
          headers: this.getAuthHeaders(server),
        },
      },
    );

    const client = new Client(
      { name: 'kyro-chat', version: '1.0.0' },
    );

    await client.connect(transport);

    this.clients.set(server.id, client);
    this.transports.set(server.id, transport);

    // Fetch available tools
    const response = await client.listTools();
    const tools: MCPToolInfo[] = response.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown> | undefined,
    }));

    this.toolCache.set(server.id, tools);
    return tools;
  }

  /**
   * Call a tool on a connected MCP server.
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`MCP server ${serverId} is not connected`);
    }

    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });

    return result;
  }

  /**
   * Disconnect from an MCP server and clean up resources.
   */
  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      try {
        await client.close();
      } catch {
        // Best-effort close; transport may already be dead
      }
      this.clients.delete(serverId);
    }
    this.transports.delete(serverId);
    this.toolCache.delete(serverId);
  }

  /**
   * Check whether a server is currently connected.
   */
  isConnected(serverId: string): boolean {
    return this.clients.has(serverId);
  }

  /**
   * Get the cached tool list for a connected server.
   */
  getCachedTools(serverId: string): MCPToolInfo[] {
    return this.toolCache.get(serverId) ?? [];
  }

  /**
   * Disconnect all servers.
   */
  async disconnectAll(): Promise<void> {
    const ids = [...this.clients.keys()];
    for (const id of ids) {
      await this.disconnect(id);
    }
  }

  /**
   * Test connectivity by listing tools.
   * Returns true if the server responds, false otherwise.
   */
  async testConnection(serverId: string): Promise<boolean> {
    const client = this.clients.get(serverId);
    if (!client) return false;

    try {
      await client.listTools();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build auth headers for the MCP server.
   */
  private getAuthHeaders(server: MCPServerConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    switch (server.authType) {
      case 'bearer':
        if (server.accessToken) {
          headers['Authorization'] = `Bearer ${server.accessToken}`;
        }
        break;
      case 'api_key':
        if (server.apiKey) {
          headers['Authorization'] = `Bearer ${server.apiKey}`;
        }
        break;
      // 'oauth' and 'none' — no extra headers needed
    }

    return headers;
  }
}

/** Singleton MCP client instance shared across the app */
export const mcpClient = new MCPClient();
