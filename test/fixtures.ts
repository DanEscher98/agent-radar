import type { GhContext } from "../src/core/github.js";
import type { PrDetail, ReviewThread } from "../src/core/pr.js";

/** A minimal fake `GhContext` for detectors that hit `ctx.octokit.request`,
 * `ctx.octokit.rest.repos.listCommits`, or `ctx.graphql` directly, so those
 * detectors can be unit-tested with no live GitHub calls. */
export function makeCtx(overrides: {
  request?: (...args: unknown[]) => unknown;
  listCommits?: (...args: unknown[]) => unknown;
  graphql?: (...args: unknown[]) => unknown;
} = {}): GhContext {
  return {
    owner: "owner",
    repo: "repo",
    login: "me",
    octokit: {
      request: overrides.request ?? (async () => ({ data: { items: [] } })),
      rest: {
        repos: {
          listCommits: overrides.listCommits ?? (async () => ({ data: [] })),
        },
      },
    } as unknown as GhContext["octokit"],
    graphql: (overrides.graphql ?? (async () => ({}))) as unknown as GhContext["graphql"],
  };
}

export function makeThread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    isResolved: false,
    isOutdated: false,
    comments: [
      {
        author: "reviewer",
        body: "please fix this",
        createdAt: "2026-11-15T10:00:00Z",
        path: "src/foo.ts",
        line: 12,
      },
    ],
    ...overrides,
  };
}

export function makePr(overrides: Partial<PrDetail> = {}): PrDetail {
  return {
    number: 1,
    title: "a PR",
    url: "https://github.com/owner/repo/pull/1",
    isDraft: false,
    mergeable: "MERGEABLE",
    reviewDecision: null,
    updatedAt: "2026-11-18T12:00:00Z",
    mergedAt: null,
    baseRefName: "main",
    headRefName: "feature",
    checkState: "SUCCESS",
    reviewThreads: [],
    closingIssues: [],
    ...overrides,
  };
}
