import { describe, expect, it } from "vitest";
import { assessCompatibility } from "../src/core/compatibility";

describe("compatibility policy", () => {
  it("allows identical versions", () => {
    expect(assessCompatibility("0.9.1", "0.9.1").status).toBe("supported");
  });

  it("blocks old data into 0.10.0-rc1", () => {
    const result = assessCompatibility("0.9.1", "0.10.0-rc1");
    expect(result.status).toBe("blocked");
  });
});
