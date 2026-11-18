import type { PrDetail } from "../pr.js";
import type { TriageItem } from "../types.js";

/** `mergeable=CONFLICTING` on your open PRs. The predictive version (diffing
 * local working-tree files against the base branch's recent commits) is
 * deferred past M1 — this ships the real GitHub-reported state first. */
export function runConflictDetector(prs: PrDetail[]): TriageItem[] {
  return prs
    .filter((pr) => pr.mergeable === "CONFLICTING")
    .map((pr) => ({
      kind: "conflict",
      detector: "Conflict Detector",
      pr: pr.number,
      severity: "high" as const,
      at: pr.updatedAt,
      detail: `#${pr.number} "${pr.title}" (${pr.headRefName} -> ${pr.baseRefName}) has a merge conflict`,
      action: `merge/rebase ${pr.baseRefName} into ${pr.headRefName} and resolve the conflict`,
    }));
}
