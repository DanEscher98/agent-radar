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

- Callable by an agent without the user asking first. What makes this true is a
  standing instruction to call it (a `CLAUDE.md` line or a `SessionStart`/`Stop`
  hook), not which protocol it's called through — a `Bash: agent-radar snapshot`
  is exactly as "callable unprompted" as an MCP tool would be. Ship the invocation
  wiring as part of M1, don't treat it as something MCP (M3) unlocks.
- Defaults to the repo at `pwd` — same convention `git`/`gh` already use (walk up to
  the nearest `.git`, read its remote). No `--repo owner/name` for the common case
  of "the repo I'm sitting in right now"; that flag exists only to look at something
  else on purpose.
- Defaults to *your* items — `author:@me OR review-requested:@me OR assignee:@me`
  baked in, not a repo-wide feed. An unfiltered feed is exactly as skimmable-past as
  the dashboards this is meant to replace.
- One digest, ranked by urgency, not a wall of raw `gh api` JSON.
- Cheap enough to call at the start of every session and periodically during one.
- Surface *content* and *the next action*, not just state — the actual unresolved
  comment text plus "likely addressed, confirm and resolve," not just "3 comments
  pending." Saves the step of translating state into what to actually do about it.
- Catch metadata drift: cases where the actual state (patch pushed, PR merged) has
  moved on but the tracking surface around it (review thread, issue, project board)
  hasn't caught up — that gap is exactly what reads as "stale" even when the real
  work is done.

## Non-goals

- No human-facing dashboard/TUI — that's `gh-dash`'s job, already covered.
- No alerting/notification service in v1 (Slack digest is a stretch goal, see M4).
- GitHub only. No GitLab/Bitbucket abstraction until there's a second real user of it.
- No new auth setup — reuses `gh auth token` from the environment's existing `gh` CLI
  login. No PAT to mint or rotate.

## Signals (the actual pain points, turned into data)

1. **Open PRs you own** (repo = the one at `pwd` unless `--repo` overrides it, items
   = yours by default, see Goals) — mergeable state (`MERGEABLE` / `CONFLICTING` /
   `UNKNOWN`), review decision (`APPROVED` / `CHANGES_REQUESTED` / `REVIEW_REQUIRED`),
   CI checks rollup, commits-behind-base, days since last activity (commit, comment,
   or review).
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
5. **Session drift** (demoted — see below) — a lightweight "session start" marker
   (branch + base SHA + timestamp, written on first call per branch) so a later call
   in the same session can answer "what landed on the base branch since I started."
   On reflection this mostly duplicates `git fetch && git log origin/main..HEAD`,
   which an agent already runs before merging as a matter of course — the marker
   buys a saved round trip, not new information. Kept as a later, optional signal
   rather than cut outright, since a cheap "has upstream moved" ping is still nicer
   than remembering to run the git commands, but it doesn't justify M2 priority the
   way the metadata-drift signals below do.

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
    { "kind": "conflict", "pr": 42, "severity": "high", "detail": "...",
      "action": "rebase onto main, resolve src/x.ts" },
    { "kind": "changes_requested", "pr": 41, "severity": "high",
      "comments": [{ "author": "...", "path": "...", "line": 12, "body": "..." }],
      "action": "address the comment on src/foo.ts:12, then reply" },
    { "kind": "stale_pr", "pr": 39, "severity": "medium", "idleDays": 4,
      "action": "ping for review or close if abandoned" },
    { "kind": "unaddressed_issue", "issue": 12, "severity": "low",
      "action": "triage or close" },
    { "kind": "stale_thread", "pr": 41, "severity": "medium",
      "detail": "comment on src/foo.ts:12 predates commit abc1234 touching that file",
      "action": "confirm the fix landed, then resolve the thread" },
    { "kind": "merged_pr_issue_open", "pr": 37, "issue": 30, "severity": "medium",
      "action": "close issue #30, it's done" },
    { "kind": "board_status_stale", "issue": 30, "severity": "low",
      "detail": "board says In Progress, issue has been closed since 2026-11-10",
      "action": "move the board card to Done" }
  ]
}
```

Terse by design — this is read by an LLM's context window, not rendered. Every item
carries an `action`, not just state: translating "here's what's wrong" into "here's
what to do about it" is work an agent would otherwise redo on every single call, so
it belongs in the tool, not left to the caller. No field that isn't needed to decide
or act goes in. `kind: "drift"` (signal 5) is omitted here — see its demoted status
above; it's documented but not part of the v1 contract.

## Architecture (phased)

**M1 — core + CLI + skill + invocation wiring** (ship first, usable immediately;
this is the phase that determines whether the tool gets used at all)
- `src/core/` — a plain TS library: `getSnapshot(cwd?)`, resolving repo + "mine"
  scope from the current directory's git remote and the authed `gh` user, plus
  `getUnresolvedComments(owner, repo, pr)` — all via `@octokit/rest`/GraphQL authed
  through `gh auth token` (shell out once at startup, no separate credential flow).
- Signals 1–4, 6, 7 (everything except the project board and the demoted drift
  signal) ship here. 6 and 7 ride along for free — same GraphQL calls signal 2
  already needs (thread/commit data, `closingIssuesReferences`), no new scope.
- Every item carries its `action` field (see Output contract) — this is the part
  that makes the digest worth reading instead of re-deriving by hand each time.
- `bin/agent-radar` CLI — `agent-radar snapshot [--repo owner/name] [--json]`,
  `--repo` optional, defaulting to `pwd`'s remote.
- A Claude Code skill (`SKILL.md` + thin wrapper script), installable into any
  project, that calls the CLI.
- **The actual deliverable of M1 isn't the skill existing, it's a standing
  instruction to use it** — a `CLAUDE.md` snippet ("run `agent-radar snapshot`
  before starting or finishing work on an issue") and/or a `SessionStart` hook
  that runs it automatically. Write both into this repo's own docs as something a
  project copies in, not just the skill file — a tool nobody's told to call isn't
  more "unprompted" than checking `gh` by hand would have been.

**M2 — project board**
- Signal 8 (project-board status) gets its own phase: it's a genuinely separate
  GraphQL shape (`ProjectV2Item` field values, org- or repo-scoped project lookup)
  and needs a scope (`read:project`) the current `DanEscher98` token doesn't have
  yet (`gh auth refresh -s read:project` before this lands) — bundling it with M1
  would block M1 on a scope change for an unrelated signal.

**M3 — stretch: session drift**
- `.agent-radar/state.json` (repo-local, gitignored) holding a session-start marker
  per branch, surfacing `kind: "drift"`. Demoted here (see signal 5) since it mostly
  duplicates a `git fetch && git log` an agent already runs before merging — build
  it only if M1/M2 in daily use show it's actually missed.

**M4 — stretch: MCP server**
- `agent-radar mcp` wraps the same `src/core/` library as MCP tools via
  `@modelcontextprotocol/sdk`. Demoted from its original M3 slot: the thing that
  makes this callable unprompted is the M1 hook/`CLAUDE.md` wiring, not the
  protocol — MCP only helps once a project *can't* install a skill/hook (e.g. an
  agent without filesystem-skill support), which isn't the common case yet.

**M5 — stretch: human-facing digest**
- A scheduled job (cron or GH Action) posting the same ranked digest to Slack/email
  — addresses the supervisor-visible half of the pain point directly, reusing M1's
  core library. Lowest priority: the agent-facing path is the actual ask.

## Tech choices

- TypeScript + Node, `@octokit/rest` for the GitHub GraphQL/REST calls actually needed
  (review threads require GraphQL; PR list/mergeable state is fine over REST).
- No CLI framework needed at this size — hand-rolled argv parsing is enough for the
  handful of subcommands in M1–M3.
- Vitest for tests, against recorded fixtures (no live GitHub calls in CI).
- `@modelcontextprotocol/sdk` for M4 only, if it ends up built at all — not pulled
  in before it's needed.

## Order of work

1. M1 — core + CLI + skill + the hook/`CLAUDE.md` wiring that actually makes it get
   called. This is the whole point; everything else is marginal without it.
2. M2 — project-board staleness, once `read:project` scope is in place.
3. M3 — session drift, only if M1 in daily use shows the git-log workaround is
   actually a recurring friction, not a hypothetical one.
4. M4 — MCP server, only if a target agent/environment can't use a filesystem
   skill or hook.
5. M5 — Slack digest, only if the supervisor-facing angle still matters once
   M1–M4 land.
