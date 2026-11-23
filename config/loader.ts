import fs from "fs";
import os from "os";
import path from "path";
import { Config, ModelConfig, MCPServerConfig } from "./config.js";
import { ConfigError } from "../utils/errors.js";

const AGENT_MD_FILE = "AGENT.MD";
const CONFIG_JSON_FILE = "config.json";

// ---------------------------------------------------------------------------
// Directories
// ---------------------------------------------------------------------------

export const getConfigDir = (): string =>
  path.join(os.homedir(), ".config", "ai-agent");

export const getDataDir = (): string =>
  path.join(os.homedir(), ".local", "share", "ai-agent");

// ---------------------------------------------------------------------------
// AGENT.MD — reads file from cwd if present
// ---------------------------------------------------------------------------

const getAgentMdContent = (cwd: string): string | null => {
  const agentMdPath = path.join(path.resolve(cwd), AGENT_MD_FILE);
  if (fs.existsSync(agentMdPath) && fs.statSync(agentMdPath).isFile()) {
    return fs.readFileSync(agentMdPath, "utf-8");
  }
  return null;
};

// ---------------------------------------------------------------------------
// JSON config file — reads config.json from a directory if present
// ---------------------------------------------------------------------------

const readJsonConfig = (directory: string): Record<string, unknown> => {
  const configPath = path.join(directory, CONFIG_JSON_FILE);
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) {
    return {};
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Deep merge
// ---------------------------------------------------------------------------

const mergeObjects = (
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> => {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      key in result &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key]) &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      result[key] = mergeObjects(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
};

// ---------------------------------------------------------------------------
// Config construction from raw object
// ---------------------------------------------------------------------------

const parseMcpServers = (
  raw: unknown,
): Record<string, MCPServerConfig> | undefined => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

  const result: Record<string, MCPServerConfig> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const s = value as Record<string, unknown>;
    try {
      result[name] = new MCPServerConfig({
        command: s["command"] as string | undefined,
        args: (s["args"] as string[] | undefined) ?? [],
        env: (s["env"] as Record<string, string> | undefined) ?? {},
        cwd: s["cwd"] as string | undefined,
        url: s["url"] as string | undefined,
        enabled: s["enabled"] as boolean | undefined,
        startupTimeoutSec: s["startup_timeout_sec"] as number | undefined,
      } as never);
    } catch {
      // skip malformed entries
    }
  }
  return result;
};

const configFromObject = (obj: Record<string, unknown>): Config => {
  const modelRaw = obj["model"] as Record<string, unknown> | undefined;
  const model = new ModelConfig({
    name: modelRaw?.["name"] as string | undefined,
    temperature: modelRaw?.["temperature"] as number | undefined,
    contextWindow: modelRaw?.["context_window"] as number | undefined,
  });

  return new Config({
    model,
    cwd: obj["cwd"] as string | undefined,
    maxTurns: obj["max_turns"] as number | undefined,
    developerInstructions: obj["developer_instructions"] as string | undefined,
    userInstructions: obj["user_instructions"] as string | undefined,
    debug: obj["debug"] as boolean | undefined,
    apiKey: obj["api_key"] as string | undefined,
    baseUrl: obj["base_url"] as string | undefined,
    mcpServers: parseMcpServers(obj["mcp_servers"]),
  });
};

// ---------------------------------------------------------------------------
// loadConfig
// ---------------------------------------------------------------------------

export const loadConfig = (cwd?: string): Config => {
  const resolvedCwd = cwd ?? process.cwd();

  // 1. Start with global config (~/.config/ai-agent/config.json)
  let configObject: Record<string, unknown> = readJsonConfig(getConfigDir());

  // 2. Merge cwd-local config (.ai-agent/config.json), overrides global
  const localJsonConfig = readJsonConfig(path.join(resolvedCwd, ".ai-agent"));
  configObject = mergeObjects(configObject, localJsonConfig);

  // 3. Inject cwd if not set by any config file
  if (!configObject["cwd"]) {
    configObject["cwd"] = resolvedCwd;
  }

  // 4. Inject AGENT.MD content as developer instructions if not already set
  if (!configObject["developer_instructions"]) {
    const agentMd = getAgentMdContent(resolvedCwd);
    if (agentMd) {
      configObject["developer_instructions"] = agentMd;
    }
  }

  try {
    return configFromObject(configObject);
  } catch (e) {
    throw new ConfigError(`Invalid configuration: ${e}`, {
      cause: e instanceof Error ? e : undefined,
    });
  }
};
