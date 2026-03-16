import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClaudeRunner } from "../src/claude-runner.js";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

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

describe("ClaudeRunner env sanitization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should not have ANTHROPIC_API_KEY key in env at all", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key";

    const runner = new ClaudeRunner({
      model: undefined,
      allowedTools: [],
      maxTurns: undefined,
      timeout: 300000,
      dangerouslySkipPermissions: false,
    });

    mockSpawn.mockReturnValue(
      createMockProcess(JSON.stringify({ result: "ok", session_id: "s1" }))
    );

    await runner.startSession("/tmp", "test");

    const spawnEnv = (mockSpawn.mock.calls[0][2] as any).env;
    expect("ANTHROPIC_API_KEY" in spawnEnv).toBe(false);

    delete process.env.ANTHROPIC_API_KEY;
  });

  it("should not have ANTHROPIC_AUTH_TOKEN key in env", async () => {
    process.env.ANTHROPIC_AUTH_TOKEN = "token-test";

    const runner = new ClaudeRunner({
      model: undefined,
      allowedTools: [],
      maxTurns: undefined,
      timeout: 300000,
      dangerouslySkipPermissions: false,
    });

    mockSpawn.mockReturnValue(
      createMockProcess(JSON.stringify({ result: "ok", session_id: "s1" }))
    );

    await runner.startSession("/tmp", "test");

    const spawnEnv = (mockSpawn.mock.calls[0][2] as any).env;
    expect("ANTHROPIC_AUTH_TOKEN" in spawnEnv).toBe(false);

    delete process.env.ANTHROPIC_AUTH_TOKEN;
  });

  it("should preserve other env variables", async () => {
    process.env.MY_CUSTOM_VAR = "keep-me";

    const runner = new ClaudeRunner({
      model: undefined,
      allowedTools: [],
      maxTurns: undefined,
      timeout: 300000,
      dangerouslySkipPermissions: false,
    });

    mockSpawn.mockReturnValue(
      createMockProcess(JSON.stringify({ result: "ok", session_id: "s1" }))
    );

    await runner.startSession("/tmp", "test");

    const spawnEnv = (mockSpawn.mock.calls[0][2] as any).env;
    expect(spawnEnv.MY_CUSTOM_VAR).toBe("keep-me");

    delete process.env.MY_CUSTOM_VAR;
  });
});
