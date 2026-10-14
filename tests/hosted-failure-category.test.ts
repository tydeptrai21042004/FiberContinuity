import { describe, expect, it } from "vitest";
import { classifyHostedFailure, classifyColdExportFailure } from "../src/core/hostedFailureCategory";

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

describe("allowlisted IndexedDB cold-export diagnostics", () => {
  it("identifies an unstable stopped database without recording the error message", () => {
    expect(classifyColdExportFailure({ code: "UNSTABLE_COLD_STORE", message: "private secret" })).toBe("COLD_STORE_UNSTABLE");
  });
  it("distinguishes unsupported storage schema and transaction errors", () => {
    expect(classifyColdExportFailure(new Error("IndexedDB store has autoIncrement"))).toBe("COLD_STORE_SCHEMA");
    expect(classifyColdExportFailure(new Error("IndexedDB cursor failed with private data"))).toBe("COLD_STORE_TRANSACTION");
    expect(classifyColdExportFailure(new Error("IndexedDB value nesting limit exceeded"))).toBe("COLD_STORE_UNSUPPORTED_VALUE");
  });
  it("uses a fixed unknown code for unrecognized private exceptions", () => {
    expect(classifyColdExportFailure(new Error("password=DO_NOT_EXPOSE"))).toBe("COLD_STORE_UNKNOWN");
  });
});
