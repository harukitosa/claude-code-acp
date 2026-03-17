import { describe, it, expect, beforeEach, vi } from "vitest";
import { SessionStore } from "../src/session-store.js";

// Mock node:fs so tests don't read/write the real persisted sessions file
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => "{}"),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
  });

  describe("create", () => {
    it("should create a session with given id and cwd", () => {
      store.create("sess-1", "/Users/test/project");
      expect(store.has("sess-1")).toBe(true);
    });

    it("should throw if session already exists", () => {
      store.create("sess-1", "/tmp");
      expect(() => store.create("sess-1", "/tmp")).toThrow();
    });
  });

  describe("getCwd", () => {
    it("should return the cwd for a session", () => {
      store.create("sess-1", "/Users/test/project");
      expect(store.getCwd("sess-1")).toBe("/Users/test/project");
    });

    it("should return undefined for unknown session", () => {
      expect(store.getCwd("unknown")).toBeUndefined();
    });
  });

  describe("claude session id mapping", () => {
    it("should store and retrieve claude session id", () => {
      store.create("sess-1", "/tmp");
      store.setClaudeSessionId("sess-1", "claude-uuid-123");
      expect(store.getClaudeSessionId("sess-1")).toBe("claude-uuid-123");
    });

    it("should return undefined if claude session id not set", () => {
      store.create("sess-1", "/tmp");
      expect(store.getClaudeSessionId("sess-1")).toBeUndefined();
    });

    it("should return undefined for unknown session", () => {
      expect(store.getClaudeSessionId("unknown")).toBeUndefined();
    });
  });

  describe("delete", () => {
    it("should remove a session", () => {
      store.create("sess-1", "/tmp");
      store.delete("sess-1");
      expect(store.has("sess-1")).toBe(false);
    });

    it("should not throw when deleting non-existent session", () => {
      expect(() => store.delete("unknown")).not.toThrow();
    });
  });

  describe("has", () => {
    it("should return false for non-existent session", () => {
      expect(store.has("nope")).toBe(false);
    });
  });

  describe("mcpServers", () => {
    it("should store and retrieve MCP servers", () => {
      const servers = [
        {
          name: "test-server",
          transport: {
            type: "stdio" as const,
            command: "node",
            args: ["server.js"],
          },
        },
      ];
      store.create("sess-1", "/tmp", servers);
      expect(store.getMcpServers("sess-1")).toEqual(servers);
    });

    it("should return empty array when no MCP servers", () => {
      store.create("sess-1", "/tmp");
      expect(store.getMcpServers("sess-1")).toEqual([]);
    });

    it("should return empty array for unknown session", () => {
      expect(store.getMcpServers("unknown")).toEqual([]);
    });
  });
});
