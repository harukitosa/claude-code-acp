import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClaudeRunner, type ClaudeResult, type StreamEvent } from "../src/claude-runner.js";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

// Mock child_process.spawn
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
const mockSpawn = vi.mocked(spawn);

function createMockProcess(
  stdoutData: string,
  exitCode: number = 0
): ChildProcess {
  const proc = new EventEmitter() as ChildProcess & EventEmitter;
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  (proc as any).stdout = stdout;
  (proc as any).stderr = stderr;
  (proc as any).pid = 12345;
  (proc as any).kill = vi.fn(() => true);

  // Simulate async data and exit
  setTimeout(() => {
    stdout.emit("data", Buffer.from(stdoutData));
    setTimeout(() => {
      proc.emit("close", exitCode);
    }, 5);
  }, 5);

  return proc;
}

function createStreamMockProcess(lines: string[], exitCode = 0): ChildProcess {
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

describe("ClaudeRunner", () => {
  let runner: ClaudeRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new ClaudeRunner();
  });

  describe("startSession", () => {
    it("should run claude -p and return result with session_id", async () => {
      const jsonOutput = JSON.stringify({
        result: "Hello! How can I help?",
        session_id: "abc-123-uuid",
      });
      mockSpawn.mockReturnValue(createMockProcess(jsonOutput));

      const result = await runner.startSession("/tmp/project", "Hello");

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        expect.arrayContaining([
          "-p",
          "Hello",
          "--output-format",
          "json",
        ]),
        expect.objectContaining({ cwd: "/tmp/project" })
      );
      expect(result.text).toBe("Hello! How can I help?");
      expect(result.sessionId).toBe("abc-123-uuid");
    });

    it("should throw on non-zero exit code", async () => {
      mockSpawn.mockReturnValue(createMockProcess("error", 1));

      await expect(
        runner.startSession("/tmp", "test")
      ).rejects.toThrow();
    });
  });

  describe("continueSession", () => {
    it("should run claude -p with --resume flag", async () => {
      const jsonOutput = JSON.stringify({
        result: "Continued response",
        session_id: "abc-123-uuid",
      });
      mockSpawn.mockReturnValue(createMockProcess(jsonOutput));

      const result = await runner.continueSession("abc-123-uuid", "next question");

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        expect.arrayContaining([
          "-p",
          "next question",
          "--resume",
          "abc-123-uuid",
          "--output-format",
          "json",
        ]),
        expect.any(Object)
      );
      expect(result.text).toBe("Continued response");
    });
  });

  describe("startSessionStreaming", () => {
    it("should emit text delta events from stream-json output", async () => {
      const lines = [
        JSON.stringify({
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Hello world" }],
          },
          session_id: "sess-456",
        }),
      ];
      mockSpawn.mockReturnValue(createStreamMockProcess(lines));

      const events: StreamEvent[] = [];
      const result = await runner.startSessionStreaming(
        "/tmp",
        "hi",
        (event) => events.push(event)
      );

      expect(result.sessionId).toBe("sess-456");
    });

    it("should handle content_block_delta events", async () => {
      const lines = [
        JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "chunk1" },
        }),
        JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "chunk2" },
        }),
        JSON.stringify({
          type: "result",
          result: "chunk1chunk2",
          session_id: "sess-789",
        }),
      ];
      mockSpawn.mockReturnValue(createStreamMockProcess(lines));

      const events: StreamEvent[] = [];
      const result = await runner.startSessionStreaming(
        "/tmp",
        "hi",
        (event) => events.push(event)
      );

      const textEvents = events.filter((e) => e.type === "text_delta");
      expect(textEvents).toHaveLength(2);
      expect(textEvents[0].text).toBe("chunk1");
      expect(textEvents[1].text).toBe("chunk2");
      expect(result.sessionId).toBe("sess-789");
    });
  });

  describe("cancel", () => {
    it("should kill a running process", () => {
      const proc = createMockProcess("{}", 0);
      mockSpawn.mockReturnValue(proc);

      // Start a session to register the process
      runner.startSession("/tmp", "test");
      runner.cancel("test-session");

      // cancel with unknown session should not throw
      expect(() => runner.cancel("unknown")).not.toThrow();
    });
  });
});
