import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClaudeRunner, type StreamEvent } from "../src/claude-runner.js";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
const mockSpawn = vi.mocked(spawn);

function createStreamProcess(
  lines: string[],
  exitCode = 0
): ChildProcess {
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

describe("Streaming", () => {
  let runner: ClaudeRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new ClaudeRunner();
  });

  describe("text_delta events", () => {
    it("should emit text_delta for content_block_delta", async () => {
      const lines = [
        JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Hello " },
        }),
        JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "world" },
        }),
        JSON.stringify({
          type: "result",
          result: "Hello world",
          session_id: "s1",
        }),
      ];
      mockSpawn.mockReturnValue(createStreamProcess(lines));

      const events: StreamEvent[] = [];
      await runner.startSessionStreaming("/tmp", "hi", (e) =>
        events.push(e)
      );

      const textDeltas = events.filter((e) => e.type === "text_delta");
      expect(textDeltas).toHaveLength(2);
      expect(textDeltas[0].text).toBe("Hello ");
      expect(textDeltas[1].text).toBe("world");
    });
  });

  describe("tool_use events", () => {
    it("should emit tool_use from assistant message", async () => {
      const lines = [
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                name: "Read",
                input: { file_path: "/tmp/test.ts" },
              },
            ],
          },
          session_id: "s1",
        }),
        JSON.stringify({
          type: "result",
          result: "",
          session_id: "s1",
        }),
      ];
      mockSpawn.mockReturnValue(createStreamProcess(lines));

      const events: StreamEvent[] = [];
      await runner.startSessionStreaming("/tmp", "read file", (e) =>
        events.push(e)
      );

      const toolEvents = events.filter((e) => e.type === "tool_use");
      expect(toolEvents).toHaveLength(1);
      expect(toolEvents[0].toolName).toBe("Read");
      expect(toolEvents[0].toolInput).toEqual({
        file_path: "/tmp/test.ts",
      });
    });
  });

  describe("mixed content events", () => {
    it("should handle text and tool_use in same message", async () => {
      const lines = [
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              { type: "text", text: "Let me check" },
              {
                type: "tool_use",
                name: "Bash",
                input: { command: "ls" },
              },
            ],
          },
          session_id: "s1",
        }),
        JSON.stringify({
          type: "result",
          result: "Let me check",
          session_id: "s1",
        }),
      ];
      mockSpawn.mockReturnValue(createStreamProcess(lines));

      const events: StreamEvent[] = [];
      await runner.startSessionStreaming("/tmp", "check", (e) =>
        events.push(e)
      );

      expect(events.filter((e) => e.type === "text_delta")).toHaveLength(1);
      expect(events.filter((e) => e.type === "tool_use")).toHaveLength(1);
    });
  });

  describe("partial line handling", () => {
    it("should handle data split across chunks", async () => {
      const proc = new EventEmitter() as ChildProcess & EventEmitter;
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      (proc as any).stdout = stdout;
      (proc as any).stderr = stderr;
      (proc as any).pid = 12345;
      (proc as any).kill = vi.fn();

      mockSpawn.mockReturnValue(proc);

      const events: StreamEvent[] = [];
      const promise = runner.startSessionStreaming(
        "/tmp",
        "hi",
        (e) => events.push(e)
      );

      // Send data in two chunks that split a JSON line
      const fullLine = JSON.stringify({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "split test" },
      });
      const resultLine = JSON.stringify({
        type: "result",
        result: "split test",
        session_id: "s1",
      });

      setTimeout(() => {
        const half = Math.floor(fullLine.length / 2);
        stdout.emit("data", Buffer.from(fullLine.slice(0, half)));
        stdout.emit(
          "data",
          Buffer.from(fullLine.slice(half) + "\n" + resultLine + "\n")
        );
        setTimeout(() => proc.emit("close", 0), 5);
      }, 5);

      await promise;

      const textDeltas = events.filter((e) => e.type === "text_delta");
      expect(textDeltas).toHaveLength(1);
      expect(textDeltas[0].text).toBe("split test");
    });
  });

  describe("continueSessionStreaming", () => {
    it("should pass --resume flag", async () => {
      const lines = [
        JSON.stringify({
          type: "result",
          result: "continued",
          session_id: "s1",
        }),
      ];
      mockSpawn.mockReturnValue(createStreamProcess(lines));

      await runner.continueSessionStreaming("s1", "next", () => {});

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        expect.arrayContaining(["--resume", "s1"]),
        expect.any(Object)
      );
    });
  });

  describe("error handling", () => {
    it("should reject on non-zero exit code", async () => {
      mockSpawn.mockReturnValue(createStreamProcess([], 1));

      await expect(
        runner.startSessionStreaming("/tmp", "hi", () => {})
      ).rejects.toThrow("exited with code 1");
    });
  });
});
