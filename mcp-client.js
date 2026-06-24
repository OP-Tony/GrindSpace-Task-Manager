const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const path = require("path");

let mcpClient = null;

async function getMcpClient() {
  if (mcpClient) return mcpClient;

  try {
    console.log("[MCP Client] Initializing connection to GrindSpace SQLite MCP Server...");
    
    // Setup Stdio Transport pointing to our mcp-server.js
    const transport = new StdioClientTransport({
      command: "node",
      args: [path.join(__dirname, "mcp-server.js")]
    });

    const client = new Client(
      {
        name: "grindspace-app-client",
        version: "1.0.0"
      },
      {
        capabilities: {}
      }
    );

    await client.connect(transport);
    console.log("[MCP Client] Successfully connected to MCP Server!");
    mcpClient = client;
    return mcpClient;
  } catch (error) {
    console.error("[MCP Client] Failed to connect to MCP Server:", error);
    throw error;
  }
}

/**
 * Execute an MCP tool by name with arguments.
 */
async function callMcpTool(toolName, args = {}) {
  try {
    const client = await getMcpClient();
    const response = await client.callTool({
      name: toolName,
      arguments: args
    });

    if (response.isError) {
      throw new Error(`MCP Tool Error: ${response.content[0].text}`);
    }

    // Parse text contents
    const textContent = response.content.find(c => c.type === "text");
    if (!textContent) {
      return null;
    }

    // Try parsing as JSON if possible, otherwise return raw text
    try {
      return JSON.parse(textContent.text);
    } catch {
      return textContent.text;
    }
  } catch (error) {
    console.error(`[MCP Client] Error calling tool ${toolName}:`, error.message);
    throw error;
  }
}

module.exports = {
  getMcpClient,
  callMcpTool
};
