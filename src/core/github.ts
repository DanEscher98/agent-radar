import { Octokit } from "@octokit/rest";
import { graphql } from "@octokit/graphql";
import { ghToken, parseOwnerRepo, resolveRepo } from "./repo.js";

export interface GhContext {
  owner: string;
  repo: string;
  login: string;
  octokit: Octokit;
  graphql: typeof graphql;
}

export async function createContext(cwd: string, repoOverride?: string): Promise<GhContext> {
  const token = ghToken();
  const octokit = new Octokit({ auth: token });
  const authedGraphql = graphql.defaults({
    headers: { authorization: `token ${token}` },
  });
  const { owner, repo } = repoOverride ? parseOwnerRepo(repoOverride) : resolveRepo(cwd);
  const viewer = await authedGraphql<{ viewer: { login: string } }>(`query { viewer { login } }`);
  return { owner, repo, login: viewer.viewer.login, octokit, graphql: authedGraphql };
}

export interface SearchItem {
  number: number;
  title: string;
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  user: { login: string } | null;
  pull_request?: { merged_at: string | null } | null;
}

/** `octokit.rest.search.issuesAndPullRequests()` carries its own deprecation
 * warning (GitHub relabeled the operation in its OpenAPI description; the
 * endpoint itself is unchanged) — calling the route directly through
 * `request()` hits the identical `GET /search/issues` endpoint without
 * going through that named, warning-logging wrapper. */
export async function searchIssuesAndPrs(
  ctx: GhContext,
  q: string,
  perPage = 50,
): Promise<SearchItem[]> {
  const res = await ctx.octokit.request("GET /search/issues", { q, per_page: perPage });
  return res.data.items as SearchItem[];
}
