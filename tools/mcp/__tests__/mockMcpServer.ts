/**
 * A minimal in-process MCP server that spawns as a child process over stdio.
 * Tests point MCPClient at this script via the "command" transport.
 *
 * Supported tools:
 *   echo  – returns the "message" argument as text
 *   fail  – returns an isError result
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "mock-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "echo",
      description: "Echoes the message argument back",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Text to echo" },
        },
        required: ["message"],
      },
    },
    {
      name: "fail",
      description: "Always returns an error result",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "echo") {
    return {
      content: [{ type: "text", text: `echo: ${(args as Record<string, unknown>)["message"]}` }],
      isError: false,
    };
  }

  if (name === "fail") {
    return {
      content: [{ type: "text", text: "intentional failure" }],
      isError: true,
    };
  }

  return {
    content: [{ type: "text", text: `unknown tool: ${name}` }],
    isError: true,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
