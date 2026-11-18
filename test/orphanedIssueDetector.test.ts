import { describe, expect, it } from "vitest";
import { runOrphanedIssueDetector } from "../src/core/detectors/orphanedIssueDetector.js";
import { makePr } from "./fixtures.js";

describe("Orphaned-Issue Detector", () => {
  it("flags a merged PR whose linked issue is still open", () => {
    const pr = makePr({
      number: 37,
      mergedAt: "2026-11-16T18:00:00Z",
      closingIssues: [{ number: 30, state: "OPEN", title: "do the thing", url: "https://x/30" }],
    });
    const items = runOrphanedIssueDetector([pr]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "merged_pr_issue_open", pr: 37, issue: 30 });
  });

  it("ignores a merged PR whose linked issue is already closed", () => {
    const pr = makePr({
      mergedAt: "2026-11-16T18:00:00Z",
      closingIssues: [{ number: 30, state: "CLOSED", title: "do the thing", url: "https://x/30" }],
    });
    expect(runOrphanedIssueDetector([pr])).toHaveLength(0);
  });
});
