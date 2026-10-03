import { describe, expect, it } from "vitest";
import { assessCompatibility } from "../src/core/compatibility";

describe("compatibility policy", () => {
  it("supports identical versions", () => {
    expect(assessCompatibility("0.9.1", "0.9.1").status).toBe("supported");
  });

  it("blocks old data into 0.10.0-rc1", () => {
    expect(assessCompatibility("0.9.1", "0.10.0-rc1").status).toBe("blocked");
  });

  it("keeps unregistered version pairs in review so restore can fail closed", () => {
    expect(assessCompatibility("0.9.0", "0.9.1").status).toBe("review");
    expect(assessCompatibility("0.9.1", "1.0.0").status).toBe("review");
  });
});
