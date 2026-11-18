import type { PrDetail } from "../pr.js";
import type { TriageItem } from "../types.js";

/** A review thread that's `isOutdated` (GitHub's own signal that a later
 * commit changed the diff region the comment pointed at) but never marked
 * `isResolved`. Can't prove the fix is correct — just that the thread is
 * very likely stale paperwork, not a genuinely open ask. */
export function runAlreadyAddressedDetector(prs: PrDetail[]): TriageItem[] {
  const items: TriageItem[] = [];
  for (const pr of prs) {
    const addressed = pr.reviewThreads.filter((thread) => !thread.isResolved && thread.isOutdated);
    for (const thread of addressed) {
      const first = thread.comments[0];
      if (!first) continue;
      items.push({
        kind: "stale_thread",
        detector: "Already-Addressed Detector",
        pr: pr.number,
        severity: "medium",
        at: first.createdAt,
        detail: `comment on ${first.path}:${first.line ?? "?"} (#${pr.number}) is outdated — a later commit changed that diff region`,
        action: "confirm the fix landed, then resolve the thread",
      });
    }
  }
  return items;
}
