import type { GhContext } from "../github.js";
import type { DuplicateEffortItem } from "../types.js";

const DEFAULT_WINDOW_DAYS = 30;

/** Has this issue, or these files, already been tried — including an
 * attempt that was closed without merging? The direct fix for patching the
 * same issue from several different angles without checking what's already
 * in flight on it. */
export async function runDuplicateEffortDetector(
  ctx: GhContext,
  scope: { issue?: number; files?: string[] },
  windowDays = DEFAULT_WINDOW_DAYS,
): Promise<DuplicateEffortItem[]> {
  const items: DuplicateEffortItem[] = [];
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);

  if (scope.issue) {
    const q = `repo:${ctx.owner}/${ctx.repo} is:pr ${scope.issue} created:>=${since}`;
    const { data } = await ctx.octokit.rest.search.issuesAndPullRequests({ q, per_page: 20 });
    for (const pr of data.items) {
      const merged = Boolean(pr.pull_request?.merged_at);
      if (pr.state === "closed" && !merged) {
        items.push({
          at: pr.closed_at ?? pr.created_at,
          kind: "already_touched",
          severity: "high",
          pr: pr.number,
          detail: `#${pr.number} "${pr.title}" was closed without merging — may already show what didn't work`,
          action: `read PR #${pr.number} before starting a new approach`,
        });
      } else if (pr.state === "open") {
        items.push({
          at: pr.created_at,
          kind: "already_touched",
          severity: "medium",
          pr: pr.number,
          detail: `#${pr.number} "${pr.title}" is already open against this issue`,
          action: `check PR #${pr.number} before opening a second one`,
        });
      }
    }
  }

  if (scope.files) {
    for (const file of scope.files) {
      const { data } = await ctx.octokit.rest.repos.listCommits({
        owner: ctx.owner,
        repo: ctx.repo,
        path: file,
        since: new Date(since).toISOString(),
        per_page: 5,
      });
      for (const commit of data) {
        items.push({
          at: commit.commit.author?.date ?? "",
          kind: "already_touched",
          severity: "low",
          sha: commit.sha.slice(0, 7),
          detail: `${file} was touched by ${commit.sha.slice(0, 7)} "${commit.commit.message.split("\n")[0]}"`,
          action: "check that commit before re-editing this file",
        });
      }
    }
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return items;
}
