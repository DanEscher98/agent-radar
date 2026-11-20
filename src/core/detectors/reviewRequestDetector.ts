import type { PrDetail } from "../pr.js";
import type { TriageItem } from "../types.js";

/** PRs where someone has explicitly requested your review and it's still
 * pending (callers pass only PRs already filtered to that set — see
 * `findPrsAwaitingMyReview`). High severity by default: an explicit request
 * is a stronger signal than a PR you merely happen to be involved in. */
export function runReviewRequestDetector(prs: PrDetail[]): TriageItem[] {
  return prs.map((pr) => ({
    kind: "review_requested",
    detector: "Review-Request Detector",
    pr: pr.number,
    severity: "high",
    at: pr.updatedAt,
    detail: `#${pr.number} "${pr.title}" is waiting on your review`,
    action: "review",
  }));
}
