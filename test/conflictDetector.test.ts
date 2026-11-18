import { describe, expect, it } from "vitest";
import { runConflictDetector } from "../src/core/detectors/conflictDetector.js";
import { makePr } from "./fixtures.js";

describe("Conflict Detector", () => {
  it("flags a PR whose mergeable state is CONFLICTING", () => {
    const items = runConflictDetector([makePr({ number: 42, mergeable: "CONFLICTING" })]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "conflict", pr: 42, severity: "high" });
  });

  it("leaves a mergeable or unknown-state PR alone", () => {
    const items = runConflictDetector([
      makePr({ number: 1, mergeable: "MERGEABLE" }),
      makePr({ number: 2, mergeable: "UNKNOWN" }),
    ]);
    expect(items).toHaveLength(0);
  });
});
