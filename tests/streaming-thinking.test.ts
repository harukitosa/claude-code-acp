import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClaudeRunner, type StreamEvent } from "../src/claude-runner.js";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
const mockSpawn = vi.mocked(spawn);

function createStreamProcess(lines: string[], exitCode = 0): ChildProcess {
  const proc = new EventEmitter() as ChildProcess & EventEmitter;
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  (proc as any).stdout = stdout;
  (proc as any).stderr = stderr;
  (proc as any).pid = 12345;
  (proc as any).kill = vi.fn(() => true);

  setTimeout(() => {
    for (const line of lines) {
      stdout.emit("data", Buffer.from(line + "\n"));
    }
    setTimeout(() => proc.emit("close", exitCode), 5);
  }, 5);

  return proc;
}

describe("Streaming thinking events", () => {
  let runner: ClaudeRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new ClaudeRunner();
  });

  it("should emit thinking event for thinking_delta", async () => {
    const lines = [
      JSON.stringify({
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "Let me think..." },
      }),
      JSON.stringify({
        type: "content_block_delta",
        index: 1,
        delta: { type: "text_delta", text: "Answer" },
      }),
      JSON.stringify({
        type: "result",
        result: "Answer",
        session_id: "s1",
      }),
    ];
    mockSpawn.mockReturnValue(createStreamProcess(lines));

    const events: StreamEvent[] = [];
    await runner.startSessionStreaming("/tmp", "think", (e) => events.push(e));

    const thinkingEvents = events.filter((e) => e.type === "thinking");
    expect(thinkingEvents).toHaveLength(1);
    expect(thinkingEvents[0].text).toBe("Let me think...");
  });

  it("should emit thinking from assistant message with thinking block", async () => {
    const lines = [
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "thinking", thinking: "Considering options..." },
            { type: "text", text: "Here is my answer" },
          ],
        },
        session_id: "s1",
      }),
      JSON.stringify({
        type: "result",
        result: "Here is my answer",
        session_id: "s1",
      }),
    ];
    mockSpawn.mockReturnValue(createStreamProcess(lines));

    const events: StreamEvent[] = [];
    await runner.startSessionStreaming("/tmp", "think", (e) => events.push(e));

    const thinkingEvents = events.filter((e) => e.type === "thinking");
    expect(thinkingEvents).toHaveLength(1);
    expect(thinkingEvents[0].text).toBe("Considering options...");
  });

  it("should include usage in result event", async () => {
    const lines = [
      JSON.stringify({
        type: "result",
        result: "done",
        session_id: "s1",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    ];
    mockSpawn.mockReturnValue(createStreamProcess(lines));

    const events: StreamEvent[] = [];
    await runner.startSessionStreaming("/tmp", "test", (e) => events.push(e));

    const resultEvents = events.filter((e) => e.type === "result");
    expect(resultEvents).toHaveLength(1);
    expect(resultEvents[0].usage).toEqual({
      input_tokens: 100,
      output_tokens: 50,
    });
  });
});
