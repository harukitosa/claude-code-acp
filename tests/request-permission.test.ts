import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClaudeCodeAgent } from "../src/agent.js";
import type { AgentSideConnection } from "@agentclientprotocol/sdk";
import type { StreamEvent } from "../src/claude-runner.js";

vi.mock("../src/validation.js", () => ({
  validateCwd: vi.fn((cwd: string) => cwd),
  validateMcpCommand: vi.fn(),
  validateMcpArgs: vi.fn(),
}));

// Mock that simulates permission_request events in streaming
vi.mock("../src/claude-runner.js", () => {
  function emitPermissionEvents(onEvent: (event: StreamEvent) => void) {
    onEvent({ type: "text_delta", text: "I need to edit a file." });
    onEvent({
      type: "permission_request",
      toolName: "Edit",
      toolInput: { file_path: "/tmp/test.ts", old_string: "foo", new_string: "bar" },
      permissionId: "perm_001",
    });
    onEvent({ type: "text_delta", text: " File edited." });
  }

  const MockClaudeRunner = vi.fn().mockImplementation(function (this: any) {
    this.startSessionStreaming = vi.fn().mockImplementation(
      async (
        _cwd: string,
        _prompt: string,
        onEvent: (event: StreamEvent) => void
      ) => {
        emitPermissionEvents(onEvent);
        return { text: "I need to edit a file. File edited.", sessionId: "uuid-perm" };
      }
    );
    this.continueSessionStreaming = vi.fn().mockImplementation(
      async (
        _sessionId: string,
        _prompt: string,
        onEvent: (event: StreamEvent) => void
      ) => {
        emitPermissionEvents(onEvent);
        return { text: "I need to edit a file. File edited.", sessionId: "uuid-perm" };
      }
    );
    this.cancel = vi.fn();
  });
  return { ClaudeRunner: MockClaudeRunner };
});

function createMockConnection(permissionResponse?: any) {
  return {
    sessionUpdate: vi.fn().mockResolvedValue(undefined),
    requestPermission: vi.fn().mockResolvedValue(
      permissionResponse ?? {
        outcome: {
          type: "selected",
          optionId: "allow_once",
        },
      }
    ),
    readTextFile: vi.fn(),
    writeTextFile: vi.fn(),
    createTerminal: vi.fn(),
    signal: new AbortController().signal,
    closed: new Promise(() => {}),
  } as unknown as AgentSideConnection;
}

describe("session/request_permission", () => {
  let conn: ReturnType<typeof createMockConnection>;
  let agent: ReturnType<typeof createClaudeCodeAgent>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function setupSession(connection: ReturnType<typeof createMockConnection>) {
    const a = createClaudeCodeAgent(connection as unknown as AgentSideConnection);
    await a.initialize({
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "test", version: "1.0" },
    });
    const session = await a.newSession({
      cwd: "/tmp",
      mcpServers: [],
    });
    return { agent: a, sessionId: session.sessionId };
  }

  it("should call requestPermission on connection when permission_request event occurs", async () => {
    conn = createMockConnection();
    const { agent, sessionId } = await setupSession(conn);

    await agent.prompt({
      sessionId,
      prompt: [{ type: "text", text: "edit the file" }],
    });

    expect(conn.requestPermission).toHaveBeenCalledTimes(1);
    const callArgs = (conn.requestPermission as any).mock.calls[0][0];
    expect(callArgs.sessionId).toBe(sessionId);
    expect(callArgs.toolCall).toBeDefined();
    expect(callArgs.toolCall.title).toBe("Edit");
  });

  it("should include allow_once and reject_once options", async () => {
    conn = createMockConnection();
    const { agent, sessionId } = await setupSession(conn);

    await agent.prompt({
      sessionId,
      prompt: [{ type: "text", text: "edit the file" }],
    });

    const callArgs = (conn.requestPermission as any).mock.calls[0][0];
    const optionKinds = callArgs.options.map((o: any) => o.kind);
    expect(optionKinds).toContain("allow_once");
    expect(optionKinds).toContain("reject_once");
  });

  it("should include allow_always and reject_always options", async () => {
    conn = createMockConnection();
    const { agent, sessionId } = await setupSession(conn);

    await agent.prompt({
      sessionId,
      prompt: [{ type: "text", text: "edit the file" }],
    });

    const callArgs = (conn.requestPermission as any).mock.calls[0][0];
    const optionKinds = callArgs.options.map((o: any) => o.kind);
    expect(optionKinds).toContain("allow_always");
    expect(optionKinds).toContain("reject_always");
  });

  it("should send tool_call update with pending status before permission request", async () => {
    conn = createMockConnection();
    const { agent, sessionId } = await setupSession(conn);

    await agent.prompt({
      sessionId,
      prompt: [{ type: "text", text: "edit the file" }],
    });

    const updates = (conn.sessionUpdate as any).mock.calls.map((c: any) => c[0].update);
    const toolCalls = updates.filter((u: any) => u.sessionUpdate === "tool_call");
    const pendingCall = toolCalls.find((u: any) => u.status === "pending");
    expect(pendingCall).toBeDefined();
    expect(pendingCall.title).toBe("Edit");
  });

  it("should send tool_call update with completed status after allow_once", async () => {
    conn = createMockConnection({
      outcome: { type: "selected", optionId: "allow_once" },
    });
    const { agent, sessionId } = await setupSession(conn);

    await agent.prompt({
      sessionId,
      prompt: [{ type: "text", text: "edit the file" }],
    });

    const updates = (conn.sessionUpdate as any).mock.calls.map((c: any) => c[0].update);
    const toolCalls = updates.filter((u: any) => u.sessionUpdate === "tool_call");
    const completedCall = toolCalls.find((u: any) => u.status === "completed");
    expect(completedCall).toBeDefined();
  });

  it("should send tool_call update with failed status after reject_once", async () => {
    conn = createMockConnection({
      outcome: { type: "selected", optionId: "reject_once" },
    });
    const { agent, sessionId } = await setupSession(conn);

    await agent.prompt({
      sessionId,
      prompt: [{ type: "text", text: "edit the file" }],
    });

    const updates = (conn.sessionUpdate as any).mock.calls.map((c: any) => c[0].update);
    const toolCalls = updates.filter((u: any) => u.sessionUpdate === "tool_call");
    const failedCall = toolCalls.find((u: any) => u.status === "failed");
    expect(failedCall).toBeDefined();
  });

  it("should send tool_call update with failed status when outcome is cancelled", async () => {
    conn = createMockConnection({
      outcome: { type: "cancelled" },
    });
    const { agent, sessionId } = await setupSession(conn);

    await agent.prompt({
      sessionId,
      prompt: [{ type: "text", text: "edit the file" }],
    });

    const updates = (conn.sessionUpdate as any).mock.calls.map((c: any) => c[0].update);
    const toolCalls = updates.filter((u: any) => u.sessionUpdate === "tool_call");
    const failedCall = toolCalls.find((u: any) => u.status === "failed");
    expect(failedCall).toBeDefined();
  });

  it("should include rawInput with tool call details in permission request", async () => {
    conn = createMockConnection();
    const { agent, sessionId } = await setupSession(conn);

    await agent.prompt({
      sessionId,
      prompt: [{ type: "text", text: "edit the file" }],
    });

    const callArgs = (conn.requestPermission as any).mock.calls[0][0];
    expect(callArgs.toolCall.rawInput).toEqual({
      file_path: "/tmp/test.ts",
      old_string: "foo",
      new_string: "bar",
    });
  });
});
