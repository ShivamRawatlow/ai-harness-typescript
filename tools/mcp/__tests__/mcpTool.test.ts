import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MCPClient } from "../client.ts";
import { MCPTool } from "../mcpTool.ts";
import { MCPServerConfig } from "../../../config/config.ts";
import { Config } from "../../../config/config.ts";
import { ToolKind } from "../../base.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = path.join(__dirname, "mockMcpServer.ts");

function makeClient(name = "mock"): MCPClient {
  return new MCPClient(
    name,
    new MCPServerConfig({ command: "tsx", args: [SERVER_SCRIPT], env: {} }),
    process.cwd(),
  );
}

describe("MCPTool", () => {
  let client: MCPClient;

  before(async () => {
    client = makeClient();
    await client.connect();
  });

  after(async () => {
    await client.disconnect();
  });

  function getEchoTool(): MCPTool {
    const toolInfo = client.tools.find((t) => t.name === "echo")!;
    return new MCPTool({
      config: new Config({}),
      client,
      toolInfo,
      name: `mock__echo`,
    });
  }

  function getFailTool(): MCPTool {
    const toolInfo = client.tools.find((t) => t.name === "fail")!;
    return new MCPTool({
      config: new Config({}),
      client,
      toolInfo,
      name: `mock__fail`,
    });
  }

  describe("metadata", () => {
    it("has kind MCP", () => {
      assert.equal(getEchoTool().kind, ToolKind.MCP);
    });

    it("name is the namespaced name passed to the constructor", () => {
      assert.equal(getEchoTool().name, "mock__echo");
    });

    it("description comes from the server tool listing", () => {
      const tool = getEchoTool();
      assert.ok(tool.description.length > 0);
    });

    it("isMutating() always returns true", () => {
      assert.equal(getEchoTool().isMutating(), true);
      assert.equal(getFailTool().isMutating(), true);
    });
  });

  describe("schema", () => {
    it("exposes properties from the server's inputSchema", () => {
      const schema = getEchoTool().schema as Record<string, unknown>;
      const props = schema["properties"] as Record<string, unknown>;
      assert.ok("message" in props);
    });

    it("exposes required fields from the server's inputSchema", () => {
      const schema = getEchoTool().schema as Record<string, unknown>;
      assert.deepEqual(schema["required"], ["message"]);
    });

    it("schema type is object", () => {
      const schema = getEchoTool().schema as Record<string, unknown>;
      assert.equal(schema["type"], "object");
    });

    it("tool with no required fields has empty required array", () => {
      const schema = getFailTool().schema as Record<string, unknown>;
      assert.deepEqual(schema["required"], []);
    });
  });

  describe("execute", () => {
    it("returns success result for a valid call", async () => {
      const result = await getEchoTool().execute({
        params: { message: "hello world" },
        cwd: process.cwd(),
      });
      assert.equal(result.success, true);
      assert.equal(result.output, "echo: hello world");
    });

    it("returns error result when server returns isError=true", async () => {
      const result = await getFailTool().execute({
        params: {},
        cwd: process.cwd(),
      });
      assert.equal(result.success, false);
      assert.equal(result.error, "intentional failure");
    });

    it("returns error result when client is not connected", async () => {
      const disconnected = makeClient("disc");
      const toolInfo = { name: "echo", description: "x", inputSchema: {}, serverName: "disc" };
      const tool = new MCPTool({ config: new Config({}), client: disconnected, toolInfo, name: "disc__echo" });

      const result = await tool.execute({ params: { message: "x" }, cwd: process.cwd() });
      assert.equal(result.success, false);
      assert.match(result.error!, /MCP tool failed/);
    });
  });
});
