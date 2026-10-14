import { describe, expect, it } from "vitest";
import { classifyHostedFailure } from "../src/core/hostedFailureCategory";

describe("redacted hosted WASM diagnostics", () => {
  it("labels Fiber YAML/config failures without returning raw RPC data", () => {
    const message = "Failed parsing YAML with private https://rpc-example.invalid/?token=secret";
    expect(classifyHostedFailure(new Error(message))).toBe("FIBER_CONFIG_INVALID");
  });
  it("distinguishes browser worker/WASM assets from CKB RPC and isolation", () => {
    expect(classifyHostedFailure(new Error("Failed to fetch dynamically imported module"))).toBe("FIBER_WASM_ASSET_OR_WORKER");
    expect(classifyHostedFailure(new Error("CKB RPC browser CORS failed"))).toBe("CKB_RPC_CONNECTIVITY");
    expect(classifyHostedFailure(new Error("Missing SharedArrayBuffer"))).toBe("BROWSER_ISOLATION");
  });
  it("does not pretend that an unknown failure was a recovery success", () => {
    expect(classifyHostedFailure(new Error("something unexpected"))).toBe("UNKNOWN_BROWSER_FAILURE");
  });
});
