import { execFileSync } from "node:child_process";
import type { PrDetail } from "../pr.js";
import type { TriageItem } from "../types.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function fileSet(output: string): Set<string> {
  return new Set(output.split("\n").filter(Boolean));
}

/** The predictive half of the Conflict Detector: for whichever open PR
 * matches the branch currently checked out at `cwd`, checks whether the
 * base branch has moved on the same files the working tree has uncommitted
 * changes to — a conflict GitHub's own `mergeable` field hasn't caught up
 * to yet, because it only recomputes after a push. Fails silently (returns
 * no items) on any git error, e.g. a detached HEAD or an unreachable
 * remote — this is a bonus signal, not something to crash triage over. */
export function runPredictiveConflictDetector(cwd: string, openPrs: PrDetail[]): TriageItem[] {
  let currentBranch: string;
  try {
    currentBranch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  } catch {
    return [];
  }

  const pr = openPrs.find((candidate) => candidate.headRefName === currentBranch);
  if (!pr || pr.mergeable === "CONFLICTING") return [];

  try {
    git(cwd, ["fetch", "origin", pr.baseRefName]);
    const mergeBase = git(cwd, ["merge-base", "HEAD", `origin/${pr.baseRefName}`]);
    const movedOnBase = fileSet(git(cwd, ["diff", "--name-only", mergeBase, `origin/${pr.baseRefName}`]));
    const localChanges = fileSet(
      [git(cwd, ["diff", "--name-only", "HEAD"]), git(cwd, ["diff", "--name-only", "--cached"])].join("\n"),
    );
    const overlap = [...localChanges].filter((file) => movedOnBase.has(file));
    if (overlap.length === 0) return [];

    return [
      {
        kind: "predicted_conflict",
        detector: "Conflict Detector",
        pr: pr.number,
        severity: "medium",
        at: new Date().toISOString(),
        detail: `${pr.baseRefName} has moved on ${overlap.join(", ")} since this branch forked, and the working tree has uncommitted changes to the same file(s) — not yet a GitHub-reported conflict, but likely to become one on push`,
        action: `pull/rebase ${pr.baseRefName} before pushing, to catch it early`,
      },
    ];
  } catch {
    return [];
  }
}
