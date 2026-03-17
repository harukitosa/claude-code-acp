import { describe, it, expect, beforeEach, vi } from "vitest";
import { SessionStore } from "../src/session-store.js";

// Mock node:fs so tests don't read/write the real persisted sessions file
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => "{}"),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

describe("SessionStore extended fields", () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
  });

  describe("mode", () => {
    it("should default mode to undefined", () => {
      store.create("s1", "/tmp");
      expect(store.getMode("s1")).toBeUndefined();
    });

    it("should set and get mode", () => {
      store.create("s1", "/tmp");
      store.setMode("s1", "architect");
      expect(store.getMode("s1")).toBe("architect");
    });

    it("should throw when setting mode on non-existent session", () => {
      expect(() => store.setMode("unknown", "code")).toThrow();
    });
  });

  describe("title", () => {
    it("should default title to undefined", () => {
      store.create("s1", "/tmp");
      expect(store.getTitle("s1")).toBeUndefined();
    });

    it("should set and get title", () => {
      store.create("s1", "/tmp");
      store.setTitle("s1", "My Session");
      expect(store.getTitle("s1")).toBe("My Session");
    });
  });

  describe("updatedAt", () => {
    it("should have createdAt set on creation", () => {
      store.create("s1", "/tmp");
      expect(store.getUpdatedAt("s1")).toBeDefined();
    });

    it("should update updatedAt via touch", () => {
      store.create("s1", "/tmp");
      const first = store.getUpdatedAt("s1");
      store.touch("s1");
      const second = store.getUpdatedAt("s1");
      expect(second).toBeDefined();
      // updatedAt should be >= createdAt
      expect(new Date(second!).getTime()).toBeGreaterThanOrEqual(
        new Date(first!).getTime()
      );
    });
  });

  describe("config overrides", () => {
    it("should default config to empty object", () => {
      store.create("s1", "/tmp");
      expect(store.getConfigOverrides("s1")).toEqual({});
    });

    it("should set and get config override", () => {
      store.create("s1", "/tmp");
      store.setConfigOverride("s1", "model", "opus");
      expect(store.getConfigOverrides("s1")).toEqual({ model: "opus" });
    });

    it("should throw when setting config on non-existent session", () => {
      expect(() => store.setConfigOverride("unknown", "model", "opus")).toThrow();
    });
  });

  describe("listAll", () => {
    it("should return empty array when no sessions", () => {
      expect(store.listAll()).toEqual([]);
    });

    it("should return all sessions as SessionInfo", () => {
      store.create("s1", "/tmp");
      store.create("s2", "/home");
      store.setTitle("s1", "Session 1");

      const list = store.listAll();
      expect(list).toHaveLength(2);

      const s1 = list.find((s) => s.sessionId === "s1");
      expect(s1).toBeDefined();
      expect(s1!.cwd).toBe("/tmp");
      expect(s1!.title).toBe("Session 1");
      expect(s1!.updatedAt).toBeDefined();
    });

    it("should filter by cwd when provided", () => {
      store.create("s1", "/tmp");
      store.create("s2", "/home");
      store.create("s3", "/tmp");

      const list = store.listAll("/tmp");
      expect(list).toHaveLength(2);
      expect(list.every((s) => s.cwd === "/tmp")).toBe(true);
    });
  });
});
