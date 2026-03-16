import { resolve, isAbsolute } from "node:path";
import { existsSync, statSync } from "node:fs";

const SHELL_METACHARACTERS = /[;|&$`(){}!<>]/;

const DEFAULT_MCP_ALLOWED_COMMANDS = [
  "node",
  "npx",
  "python3",
  "python",
  "deno",
  "bun",
];

export function validateCwd(cwd: string): string {
  if (!cwd || !cwd.trim()) {
    throw new Error("cwd must not be empty");
  }

  if (!isAbsolute(cwd)) {
    throw new Error(`cwd must be an absolute path, got: ${cwd}`);
  }

  const resolved = resolve(cwd);

  if (!existsSync(resolved)) {
    throw new Error(`cwd does not exist: ${resolved}`);
  }

  if (!statSync(resolved).isDirectory()) {
    throw new Error(`cwd is not a directory: ${resolved}`);
  }

  return resolved;
}

export function validateMcpCommand(
  command: string,
  allowedCommands?: string[]
): void {
  if (!command || !command.trim()) {
    throw new Error("MCP server command must not be empty");
  }

  if (command.includes("/") || command.includes("\\")) {
    throw new Error(
      `MCP server command must not contain path separators: ${command}`
    );
  }

  if (SHELL_METACHARACTERS.test(command)) {
    throw new Error(
      `MCP server command contains shell metacharacters: ${command}`
    );
  }

  const whitelist = allowedCommands ?? loadMcpAllowedCommands();
  if (!whitelist.includes(command)) {
    throw new Error(
      `MCP server command not in allowed list: ${command} (allowed: ${whitelist.join(", ")})`
    );
  }
}

export function validateMcpArgs(args: string[]): void {
  for (const arg of args) {
    if (SHELL_METACHARACTERS.test(arg)) {
      throw new Error(
        `MCP server argument contains shell metacharacters: ${arg}`
      );
    }
  }
}

function loadMcpAllowedCommands(): string[] {
  const envValue = process.env.CLAUDE_ACP_MCP_ALLOWED_COMMANDS;
  if (envValue) {
    return envValue.split(",").map((c) => c.trim());
  }
  return DEFAULT_MCP_ALLOWED_COMMANDS;
}
