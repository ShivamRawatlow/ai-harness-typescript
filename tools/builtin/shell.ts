import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

import {
  Tool,
  ToolConfirmation,
  ToolInvocation,
  ToolKind,
  ToolResult,
} from "../base.ts";
import { Config, ShellEnvironmentPolicy } from "../../config/config.ts";
import { isBlocked } from "./shellBlockedCommands.ts";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Params schema
// ---------------------------------------------------------------------------

const ShellParams = z.object({
  command: z.string().describe("The shell command to execute"),
  timeout: z
    .number()
    .int()
    .min(1)
    .max(600)
    .default(120)
    .describe("Timeout in seconds (default: 120)"),
  cwd: z.string().optional().describe("Working directory for the command"),
});

type ShellParamsType = z.infer<typeof ShellParams>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class ShellTool extends Tool {
  name = "shell";
  description =
    "Execute a shell command. Use this for running system commands, scripts and CLI tools. Do NOT use this for searching text in files — use the grep tool instead.";
  kind = ToolKind.SHELL;

  static readonly MAX_OUTPUT_SIZE = 100 * 1024; // 100 KB

  private shellEnvironment: ShellEnvironmentPolicy;

  constructor(config?: Config) {
    super();
    this.shellEnvironment =
      config?.shellEnvironment ?? new ShellEnvironmentPolicy();
  }

  get schema() {
    return ShellParams;
  }

  getConfirmation(invocation: ToolInvocation): ToolConfirmation | null {
    const parsed = ShellParams.safeParse(invocation.params);
    if (!parsed.success) return null;

    const { command } = parsed.data;

    return {
      toolName: this.name,
      params: invocation.params,
      description: isBlocked(command)
        ? `Execute (BLOCKED): ${command}`
        : `Execute: ${command}`,
    };
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const parsed = ShellParams.safeParse(invocation.params);
    if (!parsed.success) {
      return ToolResult.errorResult(parsed.error.issues[0].message);
    }

    const params: ShellParamsType = parsed.data;

    if (isBlocked(params.command)) {
      return ToolResult.errorResult(
        `Command blocked for safety: ${params.command}`,
        "",
        { metadata: { blocked: true } },
      );
    }

    // Resolve working directory
    let cwd: string;
    if (params.cwd) {
      cwd = path.isAbsolute(params.cwd)
        ? params.cwd
        : path.resolve(invocation.cwd, params.cwd);
    } else {
      cwd = invocation.cwd;
    }

    if (!fs.existsSync(cwd)) {
      return ToolResult.errorResult(`Working directory doesn't exist: ${cwd}`);
    }

    const shell = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
    const env = this.shellEnvironment.buildEnvironment();

    try {
      const { stdout, stderr } = await execAsync(params.command, {
        shell,
        cwd,
        timeout: params.timeout * 1000,
        maxBuffer: ShellTool.MAX_OUTPUT_SIZE * 2,
        env,
      });

      let output = "";
      if (stdout.trim()) output += stdout.trimEnd();
      if (stderr.trim()) output += `\n--- stderr ---\n${stderr.trimEnd()}`;

      if (output.length > ShellTool.MAX_OUTPUT_SIZE) {
        output =
          output.slice(0, ShellTool.MAX_OUTPUT_SIZE) +
          "\n... [output truncated]";
      }

      return new ToolResult({
        success: true,
        output,
        exitCode: 0,
      });
    } catch (err: unknown) {
      const e = err as {
        killed?: boolean;
        code?: number;
        stdout?: string;
        stderr?: string;
        signal?: string;
      };

      if (e.killed || e.signal === "SIGTERM") {
        return ToolResult.errorResult(
          `Command timed out after ${params.timeout}s`,
        );
      }

      const exitCode = e.code ?? 1;
      let output = "";
      if (e.stdout?.trim()) output += (e.stdout as string).trimEnd();
      if (e.stderr?.trim())
        output += `\n--- stderr ---\n${(e.stderr as string).trimEnd()}`;
      output += `\nExit code: ${exitCode}`;

      if (output.length > ShellTool.MAX_OUTPUT_SIZE) {
        output =
          output.slice(0, ShellTool.MAX_OUTPUT_SIZE) +
          "\n... [output truncated]";
      }

      return new ToolResult({
        success: false,
        output,
        error: e.stderr ?? String(err),
        exitCode,
      });
    }
  }
}
