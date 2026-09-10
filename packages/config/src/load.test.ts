import { describe, expect, it } from "vitest";
import { ConfigValidationError, loadConfig } from "./load.js";

describe("loadConfig", () => {
  it("applies defaults when env is empty", () => {
    const config = loadConfig({});
    expect(config).toEqual({
      PORT: 4000,
      DATA_DIR: "~/.claudeops",
      LOG_LEVEL: "info",
      PAIRING_TOKEN_TTL: 2_592_000,
      DISCOVERY_POLL_INTERVAL_MS: 15_000,
      LOG_MAX_FILE_BYTES: 10 * 1024 * 1024,
      LOG_MAX_FILES: 5,
    });
  });

  it("treats empty-string env vars as unset (uses defaults)", () => {
    const config = loadConfig({ DATA_DIR: "", PORT: "" });
    expect(config.DATA_DIR).toBe("~/.claudeops");
    expect(config.PORT).toBe(4000);
  });

  it("applies valid overrides", () => {
    const config = loadConfig({ PORT: "8080", LOG_LEVEL: "debug" });
    expect(config.PORT).toBe(8080);
    expect(config.LOG_LEVEL).toBe("debug");
  });

  it("LOG_FILE is unset by default and accepted when provided", () => {
    expect(loadConfig({}).LOG_FILE).toBeUndefined();
    expect(loadConfig({ LOG_FILE: "/var/log/claudeops.log" }).LOG_FILE).toBe(
      "/var/log/claudeops.log"
    );
  });

  it("Bordio config vars are unset by default and accepted when provided", () => {
    const defaultConfig = loadConfig({});
    expect(defaultConfig.BORDIO_API_KEY).toBeUndefined();
    expect(defaultConfig.BORDIO_OPEN_STATUS_ID).toBeUndefined();
    expect(defaultConfig.BORDIO_CLOSED_STATUS_ID).toBeUndefined();

    const configured = loadConfig({
      BORDIO_API_KEY: "brd_sk_live_test",
      BORDIO_OPEN_STATUS_ID: "status_open",
      BORDIO_CLOSED_STATUS_ID: "status_closed",
    });
    expect(configured.BORDIO_API_KEY).toBe("brd_sk_live_test");
    expect(configured.BORDIO_OPEN_STATUS_ID).toBe("status_open");
    expect(configured.BORDIO_CLOSED_STATUS_ID).toBe("status_closed");
  });

  it("accepts PORT=0 (delegates to the OS for an ephemeral port)", () => {
    expect(loadConfig({ PORT: "0" }).PORT).toBe(0);
  });

  it("rejects a negative PORT", () => {
    expect(() => loadConfig({ PORT: "-1" })).toThrow(ConfigValidationError);
  });

  it("throws a ConfigValidationError with an aggregated message on invalid input", () => {
    expect(() => loadConfig({ PORT: "not-a-number", LOG_LEVEL: "shout" })).toThrow(
      ConfigValidationError
    );
  });

  it("aggregates every invalid var, not just the first", () => {
    try {
      loadConfig({ PORT: "not-a-number", LOG_LEVEL: "shout" });
      throw new Error("expected loadConfig to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      const issues = (err as ConfigValidationError).issues;
      expect(issues.some((i) => i.startsWith("PORT"))).toBe(true);
      expect(issues.some((i) => i.startsWith("LOG_LEVEL"))).toBe(true);
    }
  });
});
