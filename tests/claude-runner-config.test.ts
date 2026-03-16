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

describe("ClaudeRunner with config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should add --model flag when model is set", async () => {
    const runner = new ClaudeRunner({
      model: "opus",
      allowedTools: [],
      maxTurns: undefined,
      timeout: 300000,
      dangerouslySkipPermissions: false,
    });

    mockSpawn.mockReturnValue(
      createMockProcess(JSON.stringify({ result: "ok", session_id: "s1" }))
    );

    await runner.startSession("/tmp", "test");

    expect(mockSpawn).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["--model", "opus"]),
      expect.any(Object)
    );
  });

  it("should add --max-turns flag when set", async () => {
    const runner = new ClaudeRunner({
      model: undefined,
      allowedTools: [],
      maxTurns: 5,
      timeout: 300000,
      dangerouslySkipPermissions: false,
    });

    mockSpawn.mockReturnValue(
      createMockProcess(JSON.stringify({ result: "ok", session_id: "s1" }))
    );

    await runner.startSession("/tmp", "test");

    expect(mockSpawn).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["--max-turns", "5"]),
      expect.any(Object)
    );
  });

  it("should add --dangerously-skip-permissions when set", async () => {
    const runner = new ClaudeRunner({
      model: undefined,
      allowedTools: [],
      maxTurns: undefined,
      timeout: 300000,
      dangerouslySkipPermissions: true,
    });

    mockSpawn.mockReturnValue(
      createMockProcess(JSON.stringify({ result: "ok", session_id: "s1" }))
    );

    await runner.startSession("/tmp", "test");

    expect(mockSpawn).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["--dangerously-skip-permissions"]),
      expect.any(Object)
    );
  });

  it("should add --allowedTools for each tool", async () => {
    const runner = new ClaudeRunner({
      model: undefined,
      allowedTools: ["Bash", "Read"],
      maxTurns: undefined,
      timeout: 300000,
      dangerouslySkipPermissions: false,
    });

    mockSpawn.mockReturnValue(
      createMockProcess(JSON.stringify({ result: "ok", session_id: "s1" }))
    );

    await runner.startSession("/tmp", "test");

    const call = mockSpawn.mock.calls[0];
    const args = call[1] as string[];
    expect(args.filter((a) => a === "--allowedTools")).toHaveLength(2);
    expect(args).toContain("Bash");
    expect(args).toContain("Read");
  });

  it("should strip ANTHROPIC_API_KEY from env", async () => {
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

    const spawnOptions = mockSpawn.mock.calls[0][2] as any;
    expect(spawnOptions.env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});
