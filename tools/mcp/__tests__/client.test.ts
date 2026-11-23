import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MCPClient, MCPServerStatus } from "../client.ts";
import { MCPServerConfig } from "../../../config/config.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = path.join(__dirname, "mockMcpServer.ts");

function makeConfig(): MCPServerConfig {
  return new MCPServerConfig({
    command: "tsx",
    args: [SERVER_SCRIPT],
    env: {},
  });
}

describe("MCPClient", () => {
  describe("connect / disconnect", () => {
    it("starts DISCONNECTED", () => {
      const client = new MCPClient("test", makeConfig(), process.cwd());
      assert.equal(client.status, MCPServerStatus.DISCONNECTED);
    });

    it("connects and becomes CONNECTED", async () => {
      const client = new MCPClient("test", makeConfig(), process.cwd());
      await client.connect();
      assert.equal(client.status, MCPServerStatus.CONNECTED);
      await client.disconnect();
    });

    it("calling connect() twice is idempotent", async () => {
      const client = new MCPClient("test", makeConfig(), process.cwd());
      await client.connect();
      await client.connect(); // second call is a no-op
      assert.equal(client.status, MCPServerStatus.CONNECTED);
      await client.disconnect();
    });

    it("disconnects and becomes DISCONNECTED", async () => {
      const client = new MCPClient("test", makeConfig(), process.cwd());
      await client.connect();
      await client.disconnect();
      assert.equal(client.status, MCPServerStatus.DISCONNECTED);
    });
  });

  describe("tools", () => {
    let client: MCPClient;

    before(async () => {
      client = new MCPClient("test", makeConfig(), process.cwd());
      await client.connect();
    });

    after(async () => {
      await client.disconnect();
    });

    it("discovers tools from the server", () => {
      const names = client.tools.map((t) => t.name);
      assert.deepEqual(names.sort(), ["echo", "fail"]);
    });

    it("tool info has correct fields", () => {
      const echo = client.tools.find((t) => t.name === "echo")!;
      assert.equal(echo.serverName, "test");
      assert.ok(echo.description.length > 0);
      assert.ok(typeof echo.inputSchema === "object");
    });

    it("tools list is empty after disconnect", async () => {
      const c = new MCPClient("tmp", makeConfig(), process.cwd());
      await c.connect();
      await c.disconnect();
      assert.equal(c.tools.length, 0);
    });
  });

  describe("callTool", () => {
    let client: MCPClient;

    before(async () => {
      client = new MCPClient("test", makeConfig(), process.cwd());
      await client.connect();
    });

    after(async () => {
      await client.disconnect();
    });

    it("returns output for a successful tool call", async () => {
      const result = await client.callTool("echo", { message: "hello" });
      assert.equal(result.isError, false);
      assert.equal(result.output, "echo: hello");
    });

    it("returns isError=true for an error tool result", async () => {
      const result = await client.callTool("fail", {});
      assert.equal(result.isError, true);
      assert.equal(result.output, "intentional failure");
    });

    it("throws when called before connect", async () => {
      const c = new MCPClient("tmp", makeConfig(), process.cwd());
      await assert.rejects(() => c.callTool("echo", { message: "x" }), /Not connected/);
    });
  });
});
