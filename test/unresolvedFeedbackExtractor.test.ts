import { describe, expect, it } from "vitest";
import { runUnresolvedFeedbackExtractor } from "../src/core/detectors/unresolvedFeedbackExtractor.js";
import { makePr, makeThread } from "./fixtures.js";

describe("Unresolved-Feedback Extractor", () => {
  it("surfaces a live thread's comments verbatim", () => {
    const pr = makePr({ number: 1, reviewThreads: [makeThread()] });
    const items = runUnresolvedFeedbackExtractor([pr]);
    expect(items).toHaveLength(1);
    expect(items[0].comments).toHaveLength(1);
    expect(items[0].comments?.[0]).toMatchObject({ path: "src/foo.ts", line: 12 });
  });

  it("ignores a resolved thread", () => {
    const pr = makePr({ reviewThreads: [makeThread({ isResolved: true })] });
    expect(runUnresolvedFeedbackExtractor([pr])).toHaveLength(0);
  });

  it("still flags an outdated thread that was never resolved", () => {
    const pr = makePr({ number: 7, reviewThreads: [makeThread({ isOutdated: true })] });
    const items = runUnresolvedFeedbackExtractor([pr]);
    expect(items).toHaveLength(1);
    expect(items[0].comments?.[0]).toMatchObject({ outdated: true });
    expect(items[0].detail).toContain("marked outdated by GitHub");
  });

  it("ignores a thread that's outdated AND resolved", () => {
    const pr = makePr({ reviewThreads: [makeThread({ isOutdated: true, isResolved: true })] });
    expect(runUnresolvedFeedbackExtractor([pr])).toHaveLength(0);
  });
});
