import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should return defaults when no env vars set", () => {
    delete process.env.CLAUDE_ACP_ALLOWED_TOOLS;
    delete process.env.CLAUDE_ACP_MODEL;
    delete process.env.CLAUDE_ACP_MAX_TURNS;
    delete process.env.CLAUDE_ACP_TIMEOUT;
    delete process.env.CLAUDE_ACP_SKIP_PERMISSIONS;

    const config = loadConfig();

    expect(config.allowedTools).toEqual([]);
    expect(config.model).toBeUndefined();
    expect(config.maxTurns).toBeUndefined();
    expect(config.timeout).toBe(300000);
    expect(config.dangerouslySkipPermissions).toBe(false);
  });

  it("should parse CLAUDE_ACP_ALLOWED_TOOLS as comma-separated list", () => {
    process.env.CLAUDE_ACP_ALLOWED_TOOLS = "Bash, Read, Edit";
    const config = loadConfig();
    expect(config.allowedTools).toEqual(["Bash", "Read", "Edit"]);
  });

  it("should parse CLAUDE_ACP_MODEL", () => {
    process.env.CLAUDE_ACP_MODEL = "opus";
    const config = loadConfig();
    expect(config.model).toBe("opus");
  });

  it("should parse CLAUDE_ACP_MAX_TURNS", () => {
    process.env.CLAUDE_ACP_MAX_TURNS = "10";
    const config = loadConfig();
    expect(config.maxTurns).toBe(10);
  });

  it("should parse CLAUDE_ACP_TIMEOUT", () => {
    process.env.CLAUDE_ACP_TIMEOUT = "60000";
    const config = loadConfig();
    expect(config.timeout).toBe(60000);
  });

  it("should parse CLAUDE_ACP_SKIP_PERMISSIONS", () => {
    process.env.CLAUDE_ACP_SKIP_PERMISSIONS = "true";
    const config = loadConfig();
    expect(config.dangerouslySkipPermissions).toBe(true);
  });
});
