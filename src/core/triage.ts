import { createContext } from "./github.js";
import {
  fetchManyPrDetails,
  findMyOpenPrNumbers,
  findMyRecentlyMergedPrNumbers,
  findPrsAwaitingMyReview,
} from "./pr.js";
import { runConflictDetector } from "./detectors/conflictDetector.js";
import { runPrHealthCheck } from "./detectors/prHealthCheck.js";
import { runUnresolvedFeedbackExtractor } from "./detectors/unresolvedFeedbackExtractor.js";
import { runOrphanedIssueDetector } from "./detectors/orphanedIssueDetector.js";
import { runStaleIssueDetector } from "./detectors/staleIssueDetector.js";
import { runPredictiveConflictDetector } from "./detectors/predictiveConflictDetector.js";
import { runBoardDesyncDetector } from "./detectors/boardDesyncDetector.js";
import { runReviewRequestDetector } from "./detectors/reviewRequestDetector.js";
import type { TriageItem, TriageResult } from "./types.js";

const MERGED_WINDOW_DAYS = 30;
const severityRank = { high: 0, medium: 1, low: 2 } as const;

function bySeverityThenRecency(a: TriageItem, b: TriageItem): number {
  const rank = severityRank[a.severity] - severityRank[b.severity];
  if (rank !== 0) return rank;
  return new Date(b.at).getTime() - new Date(a.at).getTime();
}

export async function triage(cwd: string, opts: { repo?: string } = {}): Promise<TriageResult> {
  const ctx = await createContext(cwd, opts.repo);

  const [openNumbers, mergedNumbers, reviewRequestedNumbers] = await Promise.all([
    findMyOpenPrNumbers(ctx),
    findMyRecentlyMergedPrNumbers(ctx, MERGED_WINDOW_DAYS),
    findPrsAwaitingMyReview(ctx),
  ]);
  const allNumbers = [...new Set([...openNumbers, ...mergedNumbers, ...reviewRequestedNumbers])];
  const prs = await fetchManyPrDetails(ctx, allNumbers);
  const openPrs = prs.filter((pr) => pr.mergedAt === null);
  const mergedPrs = prs.filter((pr) => pr.mergedAt !== null);
  const reviewRequestedSet = new Set(reviewRequestedNumbers);
  const awaitingMyReview = openPrs.filter((pr) => reviewRequestedSet.has(pr.number));

  const items: TriageItem[] = [
    ...runConflictDetector(openPrs),
    ...runPredictiveConflictDetector(cwd, openPrs),
    ...runPrHealthCheck(openPrs),
    ...runUnresolvedFeedbackExtractor(openPrs),
    ...runOrphanedIssueDetector(mergedPrs),
    ...runReviewRequestDetector(awaitingMyReview),
    ...(await runStaleIssueDetector(ctx)),
    ...(await runBoardDesyncDetector(ctx)),
  ];
  items.sort(bySeverityThenRecency);

  return {
    repo: `${ctx.owner}/${ctx.repo}`,
    generatedAt: new Date().toISOString(),
    items,
  };
}
