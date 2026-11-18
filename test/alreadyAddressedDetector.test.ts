import { describe, expect, it } from "vitest";
import { runAlreadyAddressedDetector } from "../src/core/detectors/alreadyAddressedDetector.js";
import { makePr, makeThread } from "./fixtures.js";

describe("Already-Addressed Detector", () => {
  it("flags an unresolved thread that's outdated", () => {
    const pr = makePr({ number: 7, reviewThreads: [makeThread({ isOutdated: true })] });
    const items = runAlreadyAddressedDetector([pr]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "stale_thread", pr: 7, severity: "medium" });
  });

  it("ignores a thread that's outdated AND already resolved", () => {
    const pr = makePr({ reviewThreads: [makeThread({ isOutdated: true, isResolved: true })] });
    expect(runAlreadyAddressedDetector([pr])).toHaveLength(0);
  });

  it("ignores a thread that's still live (neither resolved nor outdated)", () => {
    const pr = makePr({ reviewThreads: [makeThread()] });
    expect(runAlreadyAddressedDetector([pr])).toHaveLength(0);
  });
});
