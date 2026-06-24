const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

const db = require("./database");

const server = new Server(
  {
    name: "grindspace-sqlite-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools metadata
const TOOLS = [
  {
    name: "get_tasks",
    description: "Retrieve all user tasks, categorized by status (up_next, focusing, done).",
    inputSchema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "Client profile identifier to isolate user data (default: 'global')" }
      }
    }
  },
  {
    name: "add_task",
    description: "Create a new task in the user's task list.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "The task title/description" },
        status: { type: "string", enum: ["up_next", "focusing", "done"], description: "Initial status of the task (default: 'up_next')" },
        client_id: { type: "string", description: "Client profile identifier (default: 'global')" }
      },
      required: ["title"]
    }
  },
  {
    name: "update_task_status",
    description: "Update the status of a specific task (e.g. move to focusing, up_next, or done).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "The numeric database ID of the task" },
        status: { type: "string", enum: ["up_next", "focusing", "done"], description: "The new status" },
        client_id: { type: "string", description: "Client profile identifier (default: 'global')" }
      },
      required: ["id", "status"]
    }
  },
  {
    name: "delete_task",
    description: "Delete a task from the user's list.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "The numeric database ID of the task" },
        client_id: { type: "string", description: "Client profile identifier (default: 'global')" }
      },
      required: ["id"]
    }
  },
  {
    name: "get_focus_sessions",
    description: "Fetch focus session history (durations and categories) logged by the client.",
    inputSchema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "Client profile identifier (default: 'global')" }
      }
    }
  },
  {
    name: "log_focus_session",
    description: "Log a completed Pomodoro/Focus work or break session.",
    inputSchema: {
      type: "object",
      properties: {
        duration: { type: "number", description: "The duration of the session in minutes" },
        type: { type: "string", enum: ["work", "break"], description: "The type of focus session" },
        client_id: { type: "string", description: "Client profile identifier (default: 'global')" }
      },
      required: ["duration", "type"]
    }
  },
  {
    name: "get_preferences",
    description: "Retrieve adaptive memory preferences (theme, durations, volume, soundscapes).",
    inputSchema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "Client profile identifier (default: 'global')" }
      }
    }
  },
  {
    name: "update_preference",
    description: "Save or update a key-value pair in user preferences.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Setting key (e.g. theme, pomodoro_duration, soundscape)" },
        value: { type: "string", description: "Setting value to assign" },
        client_id: { type: "string", description: "Client profile identifier (default: 'global')" }
      },
      required: ["key", "value"]
    }
  }
];

// Set request handler for listing tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Set request handler for calling tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const clientId = args.client_id || "global";

  try {
    switch (name) {
      case "get_tasks": {
        const tasks = await db.getTasks(clientId);
        return { content: [{ type: "text", text: JSON.stringify(tasks) }] };
      }

      case "add_task": {
        const { title, status = "up_next" } = args;
        const task = await db.addTask(title, status, clientId);
        return { content: [{ type: "text", text: JSON.stringify(task) }] };
      }

      case "update_task_status": {
        const { id, status } = args;
        const result = await db.updateTaskStatus(id, status, clientId);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      case "delete_task": {
        const { id } = args;
        const result = await db.deleteTask(id, clientId);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      case "get_focus_sessions": {
        const sessions = await db.getFocusSessions(clientId);
        return { content: [{ type: "text", text: JSON.stringify(sessions) }] };
      }

      case "log_focus_session": {
        const { duration, type } = args;
        const result = await db.logFocusSession(duration, type, clientId);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      case "get_preferences": {
        const prefs = await db.getPreferences(clientId);
        return { content: [{ type: "text", text: JSON.stringify(prefs) }] };
      }

      case "update_preference": {
        const { key, value } = args;
        const result = await db.updatePreference(key, value, clientId);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `MCP Execution Error: ${error.message}` }],
      isError: true
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GrindSpace SQLite MCP Server running on stdio transport.");
}

main().catch((error) => {
  console.error("Fatal error starting GrindSpace MCP Server:", error);
  process.exit(1);
});
