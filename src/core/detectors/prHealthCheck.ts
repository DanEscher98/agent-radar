import type { PrDetail } from "../pr.js";
import type { TriageItem } from "../types.js";

const STALE_THRESHOLD_DAYS = 3;

/** Open PRs you own: staleness and failing CI. Mergeable state and review
 * decision are their own detectors (Conflict Detector,
 * Unresolved-Feedback Extractor) so an item isn't reported twice. */
export function runPrHealthCheck(prs: PrDetail[]): TriageItem[] {
  const items: TriageItem[] = [];
  const now = Date.now();
  for (const pr of prs) {
    const idleDays = Math.floor((now - new Date(pr.updatedAt).getTime()) / 86_400_000);
    if (idleDays >= STALE_THRESHOLD_DAYS) {
      items.push({
        kind: "stale_pr",
        detector: "PR Health Check",
        pr: pr.number,
        severity: idleDays >= STALE_THRESHOLD_DAYS * 2 ? "high" : "medium",
        at: pr.updatedAt,
        idleDays,
        detail: `#${pr.number} "${pr.title}" has had no activity in ${idleDays}d`,
        action: "ping for review, or close if abandoned",
      });
    }
    if (pr.checkState === "FAILURE") {
      items.push({
        kind: "ci_failing",
        detector: "PR Health Check",
        pr: pr.number,
        severity: "high",
        at: pr.updatedAt,
        detail: `#${pr.number} "${pr.title}" has failing checks`,
        action: "fix the failing check before expecting review",
      });
    }
  }
  return items;
}
