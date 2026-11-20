import { describe, expect, it } from "vitest";
import { runReviewRequestDetector } from "../src/core/detectors/reviewRequestDetector.js";
import { makePr } from "./fixtures.js";

describe("Review-Request Detector", () => {
  it("flags every PR passed in as high severity, waiting on your review", () => {
    const items = runReviewRequestDetector([
      makePr({ number: 7, title: "add retries" }),
      makePr({ number: 9, title: "fix typo" }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: "review_requested",
      detector: "Review-Request Detector",
      pr: 7,
      severity: "high",
      action: "review",
    });
    expect(items[0].detail).toContain("add retries");
  });

  it("returns nothing when no PR is awaiting your review", () => {
    expect(runReviewRequestDetector([])).toEqual([]);
  });
});
