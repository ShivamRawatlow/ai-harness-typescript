import path from "path";
import { minimatch } from "minimatch";

// ---------------------------------------------------------------------------
// ShellEnvironmentPolicy
// ---------------------------------------------------------------------------

export class ShellEnvironmentPolicy {
  ignoreDefaultExcludes: boolean;
  excludePatterns: string[];
  setVars: Record<string, string>;

  constructor(fields?: Partial<ShellEnvironmentPolicy>) {
    this.ignoreDefaultExcludes = fields?.ignoreDefaultExcludes ?? false;
    this.excludePatterns = fields?.excludePatterns ?? [
      "*KEY*",
      "*TOKEN*",
      "*SECRET*",
    ];
    this.setVars = fields?.setVars ?? {};
  }

  buildEnvironment(
    base: NodeJS.ProcessEnv = process.env,
  ): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(base)) {
      if (v !== undefined) env[k] = v;
    }

    if (!this.ignoreDefaultExcludes) {
      for (const key of Object.keys(env)) {
        for (const pattern of this.excludePatterns) {
          if (minimatch(key.toUpperCase(), pattern.toUpperCase())) {
            delete env[key];
            break;
          }
        }
      }
    }

    Object.assign(env, this.setVars);
    return env;
  }
}

// ---------------------------------------------------------------------------
// MCPServerConfig
// ---------------------------------------------------------------------------

export class MCPServerConfig {
  enabled: boolean;
  startupTimeoutSec: number;

  // stdio transport
  command?: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;

  // http/sse transport
  url?: string;

  constructor(
    fields: Partial<MCPServerConfig> & ({ command: string } | { url: string }),
  ) {
    this.enabled = fields.enabled ?? true;
    this.startupTimeoutSec = fields.startupTimeoutSec ?? 10;
    this.command = fields.command;
    this.args = fields.args ?? [];
    this.env = fields.env ?? {};
    this.cwd = fields.cwd;
    this.url = fields.url;

    const hasCommand = this.command !== undefined;
    const hasUrl = this.url !== undefined;

    if (!hasCommand && !hasUrl) {
      throw new Error(
        "MCPServerConfig must have either 'command' (stdio) or 'url' (http/sse)",
      );
    }
    if (hasCommand && hasUrl) {
      throw new Error(
        "MCPServerConfig cannot have both 'command' (stdio) and 'url' (http/sse)",
      );
    }
  }

  get transport(): "stdio" | "http" {
    return this.command !== undefined ? "stdio" : "http";
  }
}

// ---------------------------------------------------------------------------
// ModelConfig
// ---------------------------------------------------------------------------

export class ModelConfig {
  name: string;
  temperature: number;
  contextWindow: number;

  constructor(fields?: Partial<ModelConfig>) {
    this.name = fields?.name ?? "nvidia/nemotron-3-super-120b-a12b:free";
    this.temperature = fields?.temperature ?? 1;
    this.contextWindow = fields?.contextWindow ?? 256_000;
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export class Config {
  model: ModelConfig;
  cwd: string;
  maxTurns: number;
  allowedTools?: string[];
  developerInstructions?: string;
  userInstructions?: string;
  debug: boolean;
  shellEnvironment: ShellEnvironmentPolicy;
  apiKey?: string;
  baseUrl?: string;
  mcpServers: Record<string, MCPServerConfig>;

  constructor(
    fields?: Partial<
      Omit<Config, "model" | "shellEnvironment" | "mcpServers"> & {
        model?: Partial<ModelConfig>;
        shellEnvironment?: Partial<ShellEnvironmentPolicy>;
        mcpServers?: Record<string, MCPServerConfig>;
      }
    >,
  ) {
    this.model = new ModelConfig(fields?.model);
    this.cwd = fields?.cwd ?? process.cwd();
    this.maxTurns = fields?.maxTurns ?? 100;
    this.allowedTools = fields?.allowedTools;
    this.developerInstructions = fields?.developerInstructions;
    this.userInstructions = fields?.userInstructions;
    this.debug = fields?.debug ?? false;
    this.shellEnvironment = new ShellEnvironmentPolicy(
      fields?.shellEnvironment,
    );
    this.apiKey = fields?.apiKey ?? process.env["API_KEY"];
    this.baseUrl = fields?.baseUrl ?? process.env["BASE_URL"];
    this.mcpServers = fields?.mcpServers ?? {};
  }

  get modelName(): string {
    return this.model.name;
  }

  validate(): string[] {
    const errors: string[] = [];
    if (!this.apiKey) {
      errors.push("No API key found. Set API_KEY environment variable");
    }
    if (!path.isAbsolute(this.cwd)) {
      errors.push(`Working directory is not absolute: ${this.cwd}`);
    }
    return errors;
  }
}
