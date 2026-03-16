import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClaudeCodeAgent } from "../src/agent.js";
import type { AgentSideConnection } from "@agentclientprotocol/sdk";
import type { StreamEvent } from "../src/claude-runner.js";

vi.mock("../src/validation.js", () => ({
  validateCwd: vi.fn((cwd: string) => cwd),
  validateMcpCommand: vi.fn(),
  validateMcpArgs: vi.fn(),
}));

// Mock that simulates tool_use events in streaming
vi.mock("../src/claude-runner.js", () => {
  const MockClaudeRunner = vi.fn().mockImplementation(function (this: any) {
    this.startSessionStreaming = vi.fn().mockImplementation(
      async (
        _cwd: string,
        _prompt: string,
        onEvent: (event: StreamEvent) => void
      ) => {
        // Simulate text + tool_use events
        onEvent({ type: "text_delta", text: "Let me read that file." });
        onEvent({
          type: "tool_use",
          toolName: "Read",
          toolInput: { file_path: "/tmp/test.ts" },
        });
        onEvent({ type: "text_delta", text: " Done reading." });
        return { text: "Let me read that file. Done reading.", sessionId: "uuid-1" };
      }
    );
    this.continueSessionStreaming = vi.fn().mockResolvedValue({
      text: "Continued",
      sessionId: "uuid-1",
    });
    this.cancel = vi.fn();
  });
  return { ClaudeRunner: MockClaudeRunner };
});

function createMockConnection() {
  return {
    sessionUpdate: vi.fn().mockResolvedValue(undefined),
    requestPermission: vi.fn(),
    readTextFile: vi.fn(),
    writeTextFile: vi.fn(),
    createTerminal: vi.fn(),
    signal: new AbortController().signal,
    closed: new Promise(() => {}),
  } as unknown as AgentSideConnection;
}

describe("Agent tool_call notifications", () => {
  let conn: ReturnType<typeof createMockConnection>;
  let agent: ReturnType<typeof createClaudeCodeAgent>;

  beforeEach(() => {
    vi.clearAllMocks();
    conn = createMockConnection();
    agent = createClaudeCodeAgent(conn);
  });

  it("should send tool_call updates for tool_use events", async () => {
    await agent.initialize({
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "test", version: "1.0" },
    });
    const session = await agent.newSession({
      cwd: "/tmp",
      mcpServers: [],
    });

    await agent.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "read the file" }],
    });

    const calls = (conn.sessionUpdate as any).mock.calls;
    const updates = calls.map((c: any) => c[0].update);

    // Should have text chunks and a tool_call
    const textChunks = updates.filter(
      (u: any) => u.sessionUpdate === "agent_message_chunk"
    );
    const toolCalls = updates.filter(
      (u: any) => u.sessionUpdate === "tool_call"
    );

    expect(textChunks.length).toBeGreaterThanOrEqual(2);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].title).toBe("Read");
    expect(toolCalls[0].rawInput).toEqual({
      file_path: "/tmp/test.ts",
    });
  });
});
