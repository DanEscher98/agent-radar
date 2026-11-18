import type { GhContext } from "../github.js";
import type { TimelineEvent } from "../types.js";

const DEFAULT_LIMIT = 20;

/** The last ~20 events on the default branch (or on the given files) plus
 * recent PR activity — in chronological order. "Broad vision first": meant
 * to be called before starting work, so the agent sees what's actually
 * happened lately instead of inferring pace/state from its own stale memory. */
export async function runOrientationSweep(
  ctx: GhContext,
  scope: { issue?: number; files?: string[] },
): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];

  if (scope.files && scope.files.length > 0) {
    for (const file of scope.files) {
      const { data } = await ctx.octokit.rest.repos.listCommits({
        owner: ctx.owner,
        repo: ctx.repo,
        path: file,
        per_page: 10,
      });
      for (const commit of data) {
        events.push({
          at: commit.commit.author?.date ?? commit.commit.committer?.date ?? "",
          kind: "commit",
          sha: commit.sha.slice(0, 7),
          author: commit.author?.login ?? commit.commit.author?.name ?? "unknown",
          message: commit.commit.message.split("\n")[0],
          files: [file],
        });
      }
    }
  } else {
    const { data } = await ctx.octokit.rest.repos.listCommits({
      owner: ctx.owner,
      repo: ctx.repo,
      per_page: DEFAULT_LIMIT,
    });
    for (const commit of data) {
      events.push({
        at: commit.commit.author?.date ?? commit.commit.committer?.date ?? "",
        kind: "commit",
        sha: commit.sha.slice(0, 7),
        author: commit.author?.login ?? commit.commit.author?.name ?? "unknown",
        message: commit.commit.message.split("\n")[0],
      });
    }
  }

  const prQuery = scope.issue
    ? `repo:${ctx.owner}/${ctx.repo} is:pr ${scope.issue} sort:updated-desc`
    : `repo:${ctx.owner}/${ctx.repo} is:pr sort:updated-desc`;
  const { data: prSearch } = await ctx.octokit.rest.search.issuesAndPullRequests({
    q: prQuery,
    per_page: 10,
  });
  for (const pr of prSearch.items) {
    const merged = Boolean(pr.pull_request?.merged_at);
    const kind = merged ? "pr_merged" : pr.state === "closed" ? "pr_closed_unmerged" : "pr_opened";
    events.push({
      at: pr.pull_request?.merged_at ?? pr.closed_at ?? pr.created_at,
      kind,
      pr: pr.number,
      author: pr.user?.login ?? "unknown",
      title: pr.title,
    });
  }

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return events.slice(-DEFAULT_LIMIT);
}
