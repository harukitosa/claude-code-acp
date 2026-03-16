import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("logger", () => {
  const originalEnv = { ...process.env };
  let stderrWrite: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    stderrWrite = vi.fn();
    vi.spyOn(process.stderr, "write").mockImplementation(stderrWrite);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("should write info messages by default", async () => {
    delete process.env.LOG_LEVEL;
    const { logger } = await import("../src/logger.js");
    logger.info("test info");
    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining("[INFO]")
    );
    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining("test info")
    );
  });

  it("should not write debug messages at info level", async () => {
    delete process.env.LOG_LEVEL;
    const { logger } = await import("../src/logger.js");
    logger.debug("debug msg");
    // debug should not show at default info level
    const debugCalls = stderrWrite.mock.calls.filter((c: any) =>
      c[0].includes("[DEBUG]")
    );
    expect(debugCalls).toHaveLength(0);
  });

  it("should write error messages", async () => {
    delete process.env.LOG_LEVEL;
    const { logger } = await import("../src/logger.js");
    logger.error("something broke");
    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining("[ERROR]")
    );
  });

  it("should include timestamp in output", async () => {
    delete process.env.LOG_LEVEL;
    const { logger } = await import("../src/logger.js");
    logger.info("timestamped");
    const output = stderrWrite.mock.calls[0][0];
    // ISO timestamp pattern
    expect(output).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
