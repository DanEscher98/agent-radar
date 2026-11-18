import type { PrDetail } from "../pr.js";
import type { TriageItem } from "../types.js";

/** Cross-checks each merged PR's linked issues against their current
 * state. Catches the common misses: "related to #N" instead of a closing
 * keyword, merging into a non-default branch, or a cross-repo reference —
 * none of which auto-close the issue. */
export function runOrphanedIssueDetector(mergedPrs: PrDetail[]): TriageItem[] {
  const items: TriageItem[] = [];
  for (const pr of mergedPrs) {
    for (const issue of pr.closingIssues) {
      if (issue.state !== "OPEN") continue;
      items.push({
        kind: "merged_pr_issue_open",
        detector: "Orphaned-Issue Detector",
        pr: pr.number,
        issue: issue.number,
        severity: "medium",
        at: pr.mergedAt ?? pr.updatedAt,
        detail: `#${pr.number} merged, but linked issue #${issue.number} "${issue.title}" is still open`,
        action: `close issue #${issue.number}, it's done`,
      });
    }
  }
  return items;
}
