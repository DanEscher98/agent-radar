export type Severity = "high" | "medium" | "low";

export interface FeedbackComment {
  author: string;
  path: string;
  line: number | null;
  body: string;
  at: string;
  /** GitHub's `isOutdated` on the thread this comment belongs to: the diff
   * hunk it anchored to no longer exists verbatim. This fires just as
   * readily when an unrelated commit (a base-branch catch-up merge) shifts
   * the surrounding lines as it does when someone actually fixes the flagged
   * code — so it is not evidence the concern was addressed, only a prompt to
   * check by hand before trusting it. */
  outdated: boolean;
}

/** One finding from a `triage` detector. Every item names the detector that
 * produced it and an `action`, so the output is something to act on, not raw
 * state to re-interpret. */
export interface TriageItem {
  kind: string;
  detector: string;
  severity: Severity;
  at: string;
  action: string;
  pr?: number;
  issue?: number;
  idleDays?: number;
  detail?: string;
  comments?: FeedbackComment[];
}

export interface TimelineEvent {
  at: string;
  kind: "commit" | "pr_opened" | "pr_merged" | "pr_closed_unmerged";
  sha?: string;
  pr?: number;
  author?: string;
  message?: string;
  title?: string;
  files?: string[];
}

/** A finding from the Duplicate-Effort Detector. */
export interface DuplicateEffortItem {
  at: string;
  kind: "already_touched";
  severity: Severity;
  action: string;
  detail: string;
  pr?: number;
  sha?: string;
}

export interface TriageResult {
  repo: string;
  generatedAt: string;
  items: TriageItem[];
}

export interface OrientResult {
  repo: string;
  generatedAt: string;
  scope: { issue: number | null; files: string[] };
  orientationSweep: TimelineEvent[];
  duplicateEffort: DuplicateEffortItem[];
}
