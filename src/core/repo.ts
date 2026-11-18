import { execFileSync } from "node:child_process";

/** Resolves owner/repo from `pwd`'s git remote, same convention `git`/`gh`
 * already use — no `--repo` needed for "the repo I'm sitting in right now". */
export function resolveRepo(cwd: string): { owner: string; repo: string } {
  const url = execFileSync("git", ["remote", "get-url", "origin"], {
    cwd,
    encoding: "utf8",
  }).trim();
  const match = url.match(/github\.com[:/]+([^/]+)\/([^/.]+?)(\.git)?$/);
  if (!match) {
    throw new Error(`Could not parse a GitHub owner/repo from git remote: ${url}`);
  }
  return { owner: match[1], repo: match[2] };
}

export function parseOwnerRepo(spec: string): { owner: string; repo: string } {
  const [owner, repo] = spec.split("/");
  if (!owner || !repo) {
    throw new Error(`--repo expects "owner/name", got: ${spec}`);
  }
  return { owner, repo };
}

/** Reuses the existing `gh` CLI login — no separate credential flow. */
export function ghToken(): string {
  return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
}
