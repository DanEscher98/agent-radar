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

  it("ignores an outdated thread (that's the Already-Addressed Detector's job)", () => {
    const pr = makePr({ reviewThreads: [makeThread({ isOutdated: true })] });
    expect(runUnresolvedFeedbackExtractor([pr])).toHaveLength(0);
  });
});
