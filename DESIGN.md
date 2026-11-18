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
- Catch metadata drift too: cases where the actual state (patch pushed, PR merged)
  has moved on but the tracking surface around it (review thread, issue, project
  board) hasn't caught up — that gap is exactly what reads as "stale" to a reviewer
  even when the real work is done.

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

### Metadata drift (the patch moved, the paper trail didn't)

These are a different shape of problem from 1–5: the real state is already correct,
but something that's supposed to track it wasn't updated, so it *reads* as stale
to a reviewer even though it isn't.

6. **Addressed-but-unresolved threads** — a review thread whose comment points at a
   file/line, where a later commit on the PR touched that same file after the
   comment was posted. Can't prove the fix is correct, but it's a strong "likely
   addressed, go confirm and resolve the thread" signal versus a thread sitting on a
   file nothing has touched since (genuinely still unresolved). Needs the comment's
   `originalLine`/`diffHunk` plus the PR's commit list with per-commit changed files
   (both in GraphQL `PullRequest.reviewThreads` / `PullRequest.commits`) — no extra
   scope beyond what signal 2 already needs.
7. **Merged PR, issue still open** — cross-check each merged PR's
   `closingIssuesReferences` (GraphQL) against the linked issue's current `state`.
   Catches the common misses: the PR used "related to #N" instead of a closing
   keyword, it merged into a non-default branch so GitHub's auto-close never fired,
   or it referenced an issue in a different repo (cross-repo refs don't auto-close
   at all).
8. **Project-board status stale** — an issue/PR's GitHub Projects v2 item field
   (e.g. a "Status" single-select) still reads "In Progress"/"In Review" after the
   underlying issue/PR is actually closed or merged. Needs `ProjectV2Item` field
   values via GraphQL, which needs the `project` (or `read:project`) OAuth scope —
   call out as a setup check (`gh auth status` scope list), since a token minted
   without it will otherwise just see an empty project list and look broken.

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
    { "kind": "drift", "severity": "medium", "detail": "base moved 3 commits since session start" },
    { "kind": "stale_thread", "pr": 41, "severity": "medium",
      "detail": "comment on src/foo.ts:12 predates commit abc1234 touching that file — confirm and resolve" },
    { "kind": "merged_pr_issue_open", "pr": 37, "issue": 30, "severity": "medium" },
    { "kind": "board_status_stale", "issue": 30, "severity": "low",
      "detail": "board says In Progress, issue has been closed since 2026-11-10" }
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
- Signals 6 and 7 (addressed-but-unresolved threads, merged-PR-issue-still-open) ride
  along in M1 — same GraphQL calls signal 2 already needs (thread/commit data,
  `closingIssuesReferences`), no new scope, no new infra.
- `bin/agent-radar` CLI — `agent-radar snapshot --repo owner/name [--json]`.
- A Claude Code skill (`SKILL.md` + thin wrapper script) in this repo, installable
  into any project, that calls the CLI and hands the digest back to the agent — gets
  this working inside a real session without waiting for M2's MCP plumbing.

**M2 — drift tracking + project board**
- `.agent-radar/state.json` (repo-local, gitignored) holding the session-start
  marker per branch. `agent-radar session start` / implicit on first snapshot call.
- Drift signal added to the digest (see above).
- Signal 8 (project-board status) added here, not M1: it's a genuinely separate
  GraphQL shape (`ProjectV2Item` field values, org- or repo-scoped project lookup)
  and needs a scope (`read:project`) the current `DanEscher98` token doesn't have
  yet (`gh auth refresh -s read:project` before this lands) — bundling it with M1
  would block M1 on a scope change for an unrelated signal.

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

1. M1 core + CLI + skill (incl. addressed-but-unresolved threads, merged-PR-issue-open)
   — the whole point, ship this first.
2. M2 drift tracking + project-board staleness — "teammates moved the ground" and
   "the board doesn't know it's done" are the same category, just different sources.
3. M3 MCP server — removes the "install a skill per project" friction.
4. M4 Slack digest — only if the supervisor-facing angle still matters once M1–M3 land.
