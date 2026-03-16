import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateCwd,
  validateMcpCommand,
  validateMcpArgs,
} from "../src/validation.js";
import * as fs from "node:fs";

describe("validateCwd", () => {
  it("should accept valid absolute directory path", () => {
    expect(() => validateCwd("/tmp")).not.toThrow();
  });

  it("should return resolved path", () => {
    const result = validateCwd("/tmp");
    expect(result).toBe("/tmp");
  });

  it("should reject relative paths", () => {
    expect(() => validateCwd("./relative")).toThrow();
    expect(() => validateCwd("relative/path")).toThrow();
  });

  it("should resolve paths with .. traversal", () => {
    // /tmp/../tmp resolves to /tmp, which is valid
    const result = validateCwd("/tmp/../tmp");
    // macOS: /tmp may be /private/tmp, Linux: /tmp
    expect(result).toMatch(/\/?tmp$/);
  });

  it("should reject non-existent paths", () => {
    expect(() =>
      validateCwd("/nonexistent_path_that_does_not_exist_xyz_123")
    ).toThrow();
  });

  it("should reject file paths (not directory)", () => {
    // /etc/hosts is a file, not a directory
    expect(() => validateCwd("/etc/hosts")).toThrow();
  });

  it("should reject empty string", () => {
    expect(() => validateCwd("")).toThrow();
  });
});

describe("validateMcpCommand", () => {
  const DEFAULT_ALLOWED = ["node", "npx", "python3", "python", "deno", "bun"];

  it("should accept whitelisted commands", () => {
    for (const cmd of DEFAULT_ALLOWED) {
      expect(() => validateMcpCommand(cmd)).not.toThrow();
    }
  });

  it("should reject empty string", () => {
    expect(() => validateMcpCommand("")).toThrow();
  });

  it("should reject commands with path separators", () => {
    expect(() => validateMcpCommand("../bin/evil")).toThrow();
    expect(() => validateMcpCommand("/usr/bin/rm")).toThrow();
    expect(() => validateMcpCommand("./node")).toThrow();
  });

  it("should reject commands with shell metacharacters", () => {
    expect(() => validateMcpCommand("node;rm")).toThrow();
    expect(() => validateMcpCommand("node|cat")).toThrow();
    expect(() => validateMcpCommand("node&")).toThrow();
    expect(() => validateMcpCommand("$(evil)")).toThrow();
    expect(() => validateMcpCommand("`evil`")).toThrow();
  });

  it("should reject commands not in whitelist", () => {
    expect(() => validateMcpCommand("rm")).toThrow();
    expect(() => validateMcpCommand("curl")).toThrow();
    expect(() => validateMcpCommand("bash")).toThrow();
  });

  it("should accept custom whitelist via options", () => {
    expect(() =>
      validateMcpCommand("custom-server", ["custom-server"])
    ).not.toThrow();
  });

  it("should reject whitespace-only command", () => {
    expect(() => validateMcpCommand("   ")).toThrow();
  });
});

describe("validateMcpArgs", () => {
  it("should accept normal arguments", () => {
    expect(() => validateMcpArgs(["server.js"])).not.toThrow();
    expect(() => validateMcpArgs(["--port", "3000"])).not.toThrow();
    expect(() => validateMcpArgs([])).not.toThrow();
  });

  it("should reject arguments with shell metacharacters", () => {
    expect(() => validateMcpArgs(["server.js;rm -rf /"])).toThrow();
    expect(() => validateMcpArgs(["$(evil)"])).toThrow();
    expect(() => validateMcpArgs(["`whoami`"])).toThrow();
    expect(() => validateMcpArgs(["a|b"])).toThrow();
    expect(() => validateMcpArgs(["a&b"])).toThrow();
  });

  it("should allow hyphens, dots, slashes in args", () => {
    expect(() =>
      validateMcpArgs(["--config", "./config.json", "src/index.ts"])
    ).not.toThrow();
  });
});
