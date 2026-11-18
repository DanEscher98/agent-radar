import type { PrDetail } from "../pr.js";
import type { TriageItem } from "../types.js";

/** Review threads that are neither resolved nor outdated — still live,
 * verbatim, so the agent has what it needs to act instead of being told
 * "go check." Threads marked `isOutdated` (a later commit already changed
 * that diff region) are the Already-Addressed Detector's job, not this one's. */
export function runUnresolvedFeedbackExtractor(prs: PrDetail[]): TriageItem[] {
  const items: TriageItem[] = [];
  for (const pr of prs) {
    const live = pr.reviewThreads.filter((thread) => !thread.isResolved && !thread.isOutdated);
    if (live.length === 0) continue;
    const comments = live.flatMap((thread) =>
      thread.comments.map((comment) => ({
        author: comment.author,
        path: comment.path,
        line: comment.line,
        body: comment.body,
        at: comment.createdAt,
      })),
    );
    const earliest = comments.reduce((a, b) => (a.at < b.at ? a : b));
    items.push({
      kind: "changes_requested",
      detector: "Unresolved-Feedback Extractor",
      pr: pr.number,
      severity: "high",
      at: earliest.at,
      comments,
      detail: `#${pr.number} "${pr.title}" has ${live.length} open review thread(s)`,
      action: `address the open comment thread(s) on #${pr.number}, then reply`,
    });
  }
  return items;
}
