import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClaudeRunner } from "../src/claude-runner.js";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
const mockSpawn = vi.mocked(spawn);

function createMockProcess(output: string, exitCode = 0): ChildProcess {
  const proc = new EventEmitter() as ChildProcess & EventEmitter;
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  (proc as any).stdout = stdout;
  (proc as any).stderr = stderr;
  (proc as any).pid = 12345;
  (proc as any).kill = vi.fn();

  setTimeout(() => {
    stdout.emit("data", Buffer.from(output));
    setTimeout(() => proc.emit("close", exitCode), 5);
  }, 5);

  return proc;
}

describe("MCP config passthrough", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pass --mcp-config when mcpServers provided", async () => {
    const runner = new ClaudeRunner({
      model: undefined,
      allowedTools: [],
      maxTurns: undefined,
      timeout: 300000,
      dangerouslySkipPermissions: false,
    });

    mockSpawn.mockReturnValue(
      createMockProcess(
        JSON.stringify({ result: "ok", session_id: "s1" }) + "\n",
        0
      )
    );

    const mcpServers = [
      {
        name: "test-server",
        transport: {
          type: "stdio" as const,
          command: "node",
          args: ["server.js"],
        },
      },
    ];

    await runner.startSessionWithMcp("/tmp", "hello", mcpServers);

    const args = mockSpawn.mock.calls[0][1] as string[];
    expect(args).toContain("--mcp-config");
    // Should have written a temp config file
    const mcpConfigIdx = args.indexOf("--mcp-config");
    const configPath = args[mcpConfigIdx + 1];
    expect(configPath).toBeDefined();
  });
});
