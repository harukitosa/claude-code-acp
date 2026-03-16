import { describe, it, expect } from "vitest";
import { maskArgs } from "../src/claude-runner.js";

describe("maskArgs", () => {
  it("should mask prompt text after -p flag", () => {
    const args = ["-p", "this is a secret prompt", "--output-format", "json"];
    const masked = maskArgs(args);
    expect(masked).toBe("-p <prompt: 23 chars> --output-format json");
    expect(masked).not.toContain("secret");
  });

  it("should mask session id after --resume flag", () => {
    const args = ["-p", "hello", "--resume", "abc-uuid-123", "--output-format", "json"];
    const masked = maskArgs(args);
    expect(masked).toContain("<session-id>");
    expect(masked).not.toContain("abc-uuid-123");
  });

  it("should preserve other flags unchanged", () => {
    const args = ["--output-format", "stream-json", "--model", "opus"];
    const masked = maskArgs(args);
    expect(masked).toBe("--output-format stream-json --model opus");
  });

  it("should handle -p at the end of args (no value)", () => {
    const args = ["-p"];
    const masked = maskArgs(args);
    expect(masked).toBe("-p");
  });

  it("should handle empty args", () => {
    expect(maskArgs([])).toBe("");
  });
});
