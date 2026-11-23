import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MCPManager } from "../mcpManager.ts";
import { MCPServerStatus } from "../client.ts";
import { ToolRegistry } from "../../registry.ts";
import { ToolKind } from "../../base.ts";
import { Config } from "../../../config/config.ts";
import { MCPServerConfig } from "../../../config/config.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = path.join(__dirname, "mockMcpServer.ts");

function makeConfig(enabled = true): Config {
  return new Config({
    mcpServers: {
      mock: new MCPServerConfig({
        command: "tsx",
        args: [SERVER_SCRIPT],
        env: {},
        enabled,
      }),
    },
  });
}

describe("MCPManager", () => {
  describe("initialize", () => {
    it("connects enabled servers", async () => {
      const manager = new MCPManager(makeConfig());
      await manager.initialize();

      const statuses = manager.getServerStatus();
      assert.equal(statuses.length, 1);
      assert.equal(statuses[0].name, "mock");
      assert.equal(statuses[0].status, MCPServerStatus.CONNECTED);

      await manager.shutdown();
    });

    it("skips disabled servers", async () => {
      const manager = new MCPManager(makeConfig(false));
      await manager.initialize();

      const statuses = manager.getServerStatus();
      assert.equal(statuses.length, 0);

      await manager.shutdown();
    });

    it("calling initialize() twice is idempotent", async () => {
      const manager = new MCPManager(makeConfig());
      await manager.initialize();
      await manager.initialize(); // second call is a no-op

      const statuses = manager.getServerStatus();
      assert.equal(statuses.length, 1);

      await manager.shutdown();
    });

    it("does nothing when mcpServers is empty", async () => {
      const config = new Config({});
      const manager = new MCPManager(config);
      await manager.initialize();

      assert.equal(manager.getServerStatus().length, 0);
      await manager.shutdown();
    });
  });

  describe("registerTools", () => {
    let manager: MCPManager;

    before(async () => {
      manager = new MCPManager(makeConfig());
      await manager.initialize();
    });

    after(async () => {
      await manager.shutdown();
    });

    it("registers tools into a ToolRegistry", () => {
      const registry = new ToolRegistry();
      const count = manager.registerTools(registry);

      assert.equal(count, 2); // echo + fail
    });

    it("tool names are namespaced as serverName__toolName", () => {
      const registry = new ToolRegistry();
      manager.registerTools(registry);

      const tools = registry.getTools();
      const names = tools.map((t) => t.name).sort();
      assert.deepEqual(names, ["mock__echo", "mock__fail"]);
    });

    it("registered tools have kind MCP", () => {
      const registry = new ToolRegistry();
      manager.registerTools(registry);

      for (const tool of registry.getTools()) {
        assert.equal(tool.kind, ToolKind.MCP);
      }
    });
  });

  describe("shutdown", () => {
    it("clears all clients", async () => {
      const manager = new MCPManager(makeConfig());
      await manager.initialize();
      await manager.shutdown();

      assert.equal(manager.getServerStatus().length, 0);
    });

    it("allows re-initialize after shutdown", async () => {
      const manager = new MCPManager(makeConfig());
      await manager.initialize();
      await manager.shutdown();
      await manager.initialize();

      const statuses = manager.getServerStatus();
      assert.equal(statuses[0].status, MCPServerStatus.CONNECTED);

      await manager.shutdown();
    });
  });

  describe("getServerStatus", () => {
    it("reports tool count per server", async () => {
      const manager = new MCPManager(makeConfig());
      await manager.initialize();

      const [status] = manager.getServerStatus();
      assert.equal(status.tools, 2); // echo + fail

      await manager.shutdown();
    });
  });
});
