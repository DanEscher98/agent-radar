# agent-radar — design

## Problem

Coding agents (this one included) lose track of repo state mid-session: they keep
generating code/PRs while a base branch moves, review comments pile up unaddressed,
and merge conflicts appear that nobody notices until someone else points it out. The
human-visible symptom is a supervisor complaining about stale PRs and unanswered
review comments. The agent-visible symptom is the same user having to re-prompt
"check the status of X" over and over, because the agent has no way to pull that
context on its own.

`gh-dash` already solves the *human* version of this (a TUI you glance at). This tool
is the *agent* version: something a coding agent calls itself, unprompted, to get a
cheap, structured, token-efficient answer to "what's the state of the world right now,
and what's actually asking for my attention."

## Goals

- Callable by an agent without the user asking first (skill today, MCP tool next).
- One digest, ranked by urgency, not a wall of raw `gh api` JSON.
- Cheap enough to call at the start of every session and periodically during one.
- Surface *content*, not just counts — the actual unresolved comment text, the actual
  conflicting file, so the agent can act instead of reporting back for more detail.
- Catch drift: what changed upstream since *this session* started working, not just
  "is there a conflict right now."

## Non-goals

- No human-facing dashboard/TUI — that's `gh-dash`'s job, already covered.
- No alerting/notification service in v1 (Slack digest is a stretch goal, see M4).
- GitHub only. No GitLab/Bitbucket abstraction until there's a second real user of it.
- No new auth setup — reuses `gh auth token` from the environment's existing `gh` CLI
  login. No PAT to mint or rotate.

## Signals (the actual pain points, turned into data)

1. **Open PRs you own** — mergeable state (`MERGEABLE` / `CONFLICTING` / `UNKNOWN`),
   review decision (`APPROVED` / `CHANGES_REQUESTED` / `REVIEW_REQUIRED`), CI checks
   rollup, commits-behind-base, days since last activity (commit, comment, or review).
2. **Unresolved review threads** — not just "N comments requested changes": the actual
   thread body, author, file + line, `isResolved`/`isOutdated` filtered to the ones
   still live. This is the single highest-value signal — it's what a supervisor means
   by "stale comments," and what the agent needs verbatim to go fix it.
3. **Unaddressed issues** — open, assigned to you (or unassigned with a `needs-triage`
   label), no comment/label change since opened past a configurable threshold.
4. **Merge conflicts** — `mergeable=CONFLICTING` on your open PRs, plus a *predictive*
   version: diff the base branch's commits since the PR's branch point against the
   files the agent's current working tree has touched, so a conflict is flagged
   before GitHub's own mergeable check catches up.
5. **Session drift** — a lightweight "session start" marker (branch + base SHA +
   timestamp, written on first call per branch) so a later call in the same session
   can answer "what landed on the base branch, or on PRs touching my files, since I
   started" — the actual "agent generates code while teammates update" failure mode
   from the brief.

## Output contract

One JSON digest per call, ranked most-urgent first:

```jsonc
{
  "repo": "DanEscher98/agent-radar",
  "generatedAt": "2026-11-18T22:00:00Z",
  "items": [
    { "kind": "conflict", "pr": 42, "severity": "high", "detail": "..." },
    { "kind": "changes_requested", "pr": 41, "severity": "high",
      "comments": [{ "author": "...", "path": "...", "line": 12, "body": "..." }] },
    { "kind": "stale_pr", "pr": 39, "severity": "medium", "idleDays": 4 },
    { "kind": "unaddressed_issue", "issue": 12, "severity": "low" },
    { "kind": "drift", "severity": "medium", "detail": "base moved 3 commits since session start" }
  ]
}
```

Terse by design — this is read by an LLM's context window, not rendered. No field
that isn't needed to decide or act goes in.

## Architecture (phased)

**M1 — core + CLI + Claude Code skill** (ship first, usable immediately)
- `src/core/` — a plain TS library: `getSnapshot(owner, repo)`,
  `getUnresolvedComments(owner, repo, pr)`, using `@octokit/rest` authed via
  `gh auth token` (shell out once at startup, no separate credential flow).
- `bin/agent-radar` CLI — `agent-radar snapshot --repo owner/name [--json]`.
- A Claude Code skill (`SKILL.md` + thin wrapper script) in this repo, installable
  into any project, that calls the CLI and hands the digest back to the agent — gets
  this working inside a real session without waiting for M2's MCP plumbing.

**M2 — drift tracking**
- `.agent-radar/state.json` (repo-local, gitignored) holding the session-start
  marker per branch. `agent-radar session start` / implicit on first snapshot call.
- Drift signal added to the digest (see above).

**M3 — MCP server**
- `agent-radar mcp` wraps the same `src/core/` library as MCP tools
  (`get_snapshot`, `get_unresolved_comments`, `get_drift`) via
  `@modelcontextprotocol/sdk`, registered once (`claude mcp add`) so any agent session
  can call it with no slash command and no per-session skill install.

**M4 — stretch: human-facing digest**
- A scheduled job (cron or GH Action) posting the same ranked digest to Slack/email —
  addresses the supervisor-visible half of the pain point directly, reusing M1's core
  library. Lowest priority: the agent-facing path is the actual ask.

## Tech choices

- TypeScript + Node, `@octokit/rest` for the GitHub GraphQL/REST calls actually needed
  (review threads require GraphQL; PR list/mergeable state is fine over REST).
- No CLI framework needed at this size — hand-rolled argv parsing is enough for the
  handful of subcommands in M1–M3.
- Vitest for tests, against recorded fixtures (no live GitHub calls in CI).
- `@modelcontextprotocol/sdk` for M3 only — not pulled in before it's needed.

## Order of work

1. M1 core + CLI + skill — the whole point, ship this first.
2. M2 drift tracking — the "teammates moved the ground" failure mode specifically.
3. M3 MCP server — removes the "install a skill per project" friction.
4. M4 Slack digest — only if the supervisor-facing angle still matters once M1–M3 land.
