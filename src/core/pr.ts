import type { GhContext } from "./github.js";

export interface ReviewThreadComment {
  author: string;
  body: string;
  createdAt: string;
  path: string;
  line: number | null;
}

export interface ReviewThread {
  isResolved: boolean;
  isOutdated: boolean;
  comments: ReviewThreadComment[];
}

export interface ClosingIssue {
  number: number;
  state: "OPEN" | "CLOSED";
  title: string;
  url: string;
}

export interface PrDetail {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  reviewDecision: string | null;
  updatedAt: string;
  mergedAt: string | null;
  baseRefName: string;
  headRefName: string;
  checkState: string | null;
  reviewThreads: ReviewThread[];
  closingIssues: ClosingIssue[];
}

const PR_DETAIL_QUERY = `
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        number
        title
        url
        isDraft
        mergeable
        reviewDecision
        updatedAt
        mergedAt
        baseRefName
        headRefName
        commits(last: 1) {
          nodes { commit { statusCheckRollup { state } } }
        }
        reviewThreads(first: 50) {
          nodes {
            isResolved
            isOutdated
            comments(first: 10) {
              nodes { author { login } body createdAt path originalLine }
            }
          }
        }
        closingIssuesReferences(first: 10) {
          nodes { number state title url }
        }
      }
    }
  }
`;

interface PrDetailQueryResult {
  repository: {
    pullRequest: {
      number: number;
      title: string;
      url: string;
      isDraft: boolean;
      mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
      reviewDecision: string | null;
      updatedAt: string;
      mergedAt: string | null;
      baseRefName: string;
      headRefName: string;
      commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] };
      reviewThreads: {
        nodes: {
          isResolved: boolean;
          isOutdated: boolean;
          comments: {
            nodes: {
              author: { login: string } | null;
              body: string;
              createdAt: string;
              path: string;
              originalLine: number | null;
            }[];
          };
        }[];
      };
      closingIssuesReferences: { nodes: ClosingIssue[] };
    } | null;
  };
}

export async function findMyOpenPrNumbers(ctx: GhContext): Promise<number[]> {
  const q = `repo:${ctx.owner}/${ctx.repo} is:pr is:open involves:@me`;
  const res = await ctx.octokit.rest.search.issuesAndPullRequests({ q, per_page: 50 });
  return res.data.items.map((item) => item.number);
}

export async function findMyRecentlyMergedPrNumbers(ctx: GhContext, days: number): Promise<number[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const q = `repo:${ctx.owner}/${ctx.repo} is:pr is:merged author:@me merged:>=${since}`;
  const res = await ctx.octokit.rest.search.issuesAndPullRequests({ q, per_page: 50 });
  return res.data.items.map((item) => item.number);
}

export async function fetchPrDetail(ctx: GhContext, number: number): Promise<PrDetail | null> {
  const data = await ctx.graphql<PrDetailQueryResult>(PR_DETAIL_QUERY, {
    owner: ctx.owner,
    repo: ctx.repo,
    number,
  });
  const pr = data.repository.pullRequest;
  if (!pr) return null;
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    isDraft: pr.isDraft,
    mergeable: pr.mergeable,
    reviewDecision: pr.reviewDecision,
    updatedAt: pr.updatedAt,
    mergedAt: pr.mergedAt,
    baseRefName: pr.baseRefName,
    headRefName: pr.headRefName,
    checkState: pr.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null,
    reviewThreads: pr.reviewThreads.nodes.map((thread) => ({
      isResolved: thread.isResolved,
      isOutdated: thread.isOutdated,
      comments: thread.comments.nodes.map((comment) => ({
        author: comment.author?.login ?? "unknown",
        body: comment.body,
        createdAt: comment.createdAt,
        path: comment.path,
        line: comment.originalLine ?? null,
      })),
    })),
    closingIssues: pr.closingIssuesReferences.nodes,
  };
}

export async function fetchManyPrDetails(ctx: GhContext, numbers: number[]): Promise<PrDetail[]> {
  const details = await Promise.all(numbers.map((number) => fetchPrDetail(ctx, number)));
  return details.filter((detail): detail is PrDetail => detail !== null);
}
