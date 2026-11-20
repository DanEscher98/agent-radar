import type { PrDetail } from "../pr.js";
import type { TriageItem } from "../types.js";

/** Every review thread GitHub does not show as `isResolved` — the one signal
 * that someone actually engaged with it, by applying the fix or by
 * explicitly dismissing the concern. `isResolved` is a deliberate human
 * action; nothing else here substitutes for it.
 *
 * This deliberately does NOT skip `isOutdated` threads. GitHub sets that
 * flag whenever any later commit shifts the lines a comment anchored to —
 * including a base-branch catch-up merge that never touches the flagged
 * code at all. Treating it as "likely fixed" let real, unaddressed findings
 * merge untouched; it is surfaced per-comment instead, so the agent can
 * check by hand rather than trust it. */
export function runUnresolvedFeedbackExtractor(prs: PrDetail[]): TriageItem[] {
  const items: TriageItem[] = [];
  for (const pr of prs) {
    const open = pr.reviewThreads.filter((thread) => !thread.isResolved);
    if (open.length === 0) continue;
    const comments = open.flatMap((thread) =>
      thread.comments.map((comment) => ({
        author: comment.author,
        path: comment.path,
        line: comment.line,
        body: comment.body,
        at: comment.createdAt,
        outdated: thread.isOutdated,
      })),
    );
    const earliest = comments.reduce((a, b) => (a.at < b.at ? a : b));
    const outdatedCount = comments.filter((c) => c.outdated).length;
    const outdatedNote =
      outdatedCount > 0
        ? ` (${outdatedCount} marked outdated by GitHub — a later commit may have fixed it, or may have just shifted the diff; verify before resolving)`
        : "";
    items.push({
      kind: "changes_requested",
      detector: "Unresolved-Feedback Extractor",
      pr: pr.number,
      severity: "high",
      at: earliest.at,
      comments,
      detail: `#${pr.number} "${pr.title}" has ${open.length} open review thread(s)${outdatedNote}`,
      action: `address the open comment thread(s) on #${pr.number}, then reply`,
    });
  }
  return items;
}
