import { searchIssuesAndPrs, type GhContext } from "../github.js";
import type { TriageItem } from "../types.js";

const DEFAULT_THRESHOLD_DAYS = 7;

/** Open issues assigned to you, untouched past a threshold. */
export async function runStaleIssueDetector(
  ctx: GhContext,
  thresholdDays = DEFAULT_THRESHOLD_DAYS,
): Promise<TriageItem[]> {
  const q = `repo:${ctx.owner}/${ctx.repo} is:issue is:open assignee:@me`;
  const issues = await searchIssuesAndPrs(ctx, q);
  const now = Date.now();
  const items: TriageItem[] = [];
  for (const issue of issues) {
    const idleDays = Math.floor((now - new Date(issue.updated_at).getTime()) / 86_400_000);
    if (idleDays < thresholdDays) continue;
    items.push({
      kind: "unaddressed_issue",
      detector: "Stale-Issue Detector",
      issue: issue.number,
      severity: idleDays >= thresholdDays * 2 ? "medium" : "low",
      at: issue.updated_at,
      detail: `#${issue.number} "${issue.title}" untouched for ${idleDays}d`,
      action: "triage or close",
    });
  }
  return items;
}
