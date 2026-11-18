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
