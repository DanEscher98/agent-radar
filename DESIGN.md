# agent-radar — design

## Problem

The deepest version of this problem isn't "stale PRs/comments exist" — it's that an
agent working a session has no cheap way to re-ground itself in what's actually true
about the project right now, so it drifts: it keeps generating patches on a mental
model of the repo that's increasingly out of date, it answers "what are we doing"
mid-session from its own accumulated (and fallible) context instead of from the
repo's real state, and — the sharpest symptom — it has been observed patching the
*same issue* from several different angles across a session because it never built
a broad picture first, just reacted file-by-file. Each of those re-patches is itself
an ad hoc round of `gh` calls, which bloats the very context window the agent is
trying to reason inside — a self-reinforcing version of the problem.

The stale-PR/unanswered-comment symptom (what originally prompted this tool, and
what a supervisor actually complains about) is a special case of the same root
cause: the agent's picture of "what's done" lagged the repo's real state. Fixing
*that* picture — one cheap, aggregated call instead of many piecemeal ones — fixes
both: the agent drifts less and hallucinates less about project state, and the
triage symptoms (stale threads, open issues on merged work) come along for free as
specific signals inside the same aggregated picture.

`gh-dash` already solves the *human* version of this (a TUI you glance at). This
tool is the *agent* version: something a coding agent calls itself, unprompted, to
re-ground in "what's actually true right now, in order, and what's asking for
attention" — in one cheap call instead of the many ad hoc ones that would otherwise
pile up in its own history.

## Goals

- Callable by an agent without the user asking first. What makes this true is a
  standing instruction to call it (a `CLAUDE.md` line or a `SessionStart`/`Stop`
  hook), not which protocol it's called through — a `Bash: agent-radar triage`
  is exactly as "callable unprompted" as an MCP tool would be. Ship the invocation
  wiring as part of M1, don't treat it as something MCP (M4) unlocks.
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
- Every event and item carries a real timestamp (ISO 8601, not just "4 days ago")
  — an agent re-grounding itself needs an actual timeline it can reason about
  ("the comment predates the fix," "three commits landed on main in the last hour"),
  not just current state with no sense of order or pace.
- Minimize total round-trips across a session, not just per call: one aggregated
  call should replace the several ad hoc `gh pr view` / `gh api graphql` calls an
  agent would otherwise make while reorienting, which is what actually keeps the
  conversation history lean. A call that's individually cheap but still invites five
  more follow-up calls hasn't solved this.
- Support orientation *before* acting, not just triage after something's already
  wrong: a cheap check for "has this issue/these files already been touched
  recently, by me or someone else" is what would have caught the same-issue,
  different-angle re-patching this was built to stop — see the Orientation Sweep
  and Duplicate-Effort Detector below.
- Name every tool/detector for what it's *for*, not what data it happens to return
  — "Duplicate-Effort Detector," not "already-touched list." A plain name invites
  treating the output as raw data to re-interpret; an intent name is itself a
  reminder of why the call was worth making.

## Non-goals

- No human-facing dashboard/TUI — that's `gh-dash`'s job, already covered.
- No alerting/notification service in v1 (Slack digest is a stretch goal, see M5).
- GitHub only. No GitLab/Bitbucket abstraction until there's a second real user of it.
- No new auth setup — reuses `gh auth token` from the environment's existing `gh` CLI
  login. No PAT to mint or rotate.

## Two tools: `orient` vs `triage`

Different moments in a session want different weight of call, which is why this
isn't one command:

- **`agent-radar orient [--issue N] [--files a,b,c]`** — cheap, meant to be called
  often, mid-session. Runs the **Orientation Sweep** and the **Duplicate-Effort
  Detector**, scoped tightly to the issue/files given. Answers "what are we
  actually doing, and has this already been touched" without the cost of the full
  triage sweep — the direct antidote to re-patching the same issue from a new angle
  without having checked what's already in flight on it.
- **`agent-radar triage`** — the fuller digest: **PR Health Check**,
  **Unresolved-Feedback Extractor**, **Review-Request Detector**, **Stale-Issue
  Detector**, **Conflict Detector**, and the metadata-drift detectors
  (**Orphaned-Issue Detector**, **Board-Desync Detector**). Called at the start
  and end of working a PR/issue, not continuously — this is the one that
  answers the original "stale PRs and comments" ask.

Both share `src/core/`; `orient` is not a smaller rewrite of `triage`, it's a
narrower query over the same data sources, run by a different detector set.

## Detectors (the actual pain points, turned into data)

Every detector below returns a real timestamp (`at`, ISO 8601) per event/item, not
just a precomputed "idleDays" — the relative figures in the examples are *derived
from* that timestamp for convenience, not a replacement for it.

### Orientation Sweep (`orient`'s primary detector)

The last N (default ~20) events on the default branch and on anything touching the
files or issue number given: commits (author, message, files, timestamp), PR opens/
merges/closes, issue comments — in chronological order. This is "broad vision
first": called before starting work on an issue, it answers "what's actually
happened here lately" instead of the agent inferring pace/state from its own stale
memory.

### PR Health Check

Open PRs you own (repo = the one at `pwd` unless `--repo` overrides it, items =
yours by default, see Goals) — mergeable state (`MERGEABLE` / `CONFLICTING` /
`UNKNOWN`), review decision (`APPROVED` / `CHANGES_REQUESTED` / `REVIEW_REQUIRED`),
CI checks rollup, commits-behind-base, days since last activity (commit, comment,
or review).

### Unresolved-Feedback Extractor

Not just "N comments requested changes": the actual thread body, author, file +
line, for every thread GitHub doesn't show as `isResolved` — the one signal that
a human actually engaged with it, by applying the fix or by explicitly
dismissing the concern. This is the single highest-value detector — it's what a
supervisor means by "stale comments," and what the agent needs verbatim to go
fix it.

Deliberately does *not* filter out `isOutdated` threads. An earlier version did,
on the theory that a shifted diff hunk meant the code had moved on — but GitHub
sets `isOutdated` whenever *any* later commit changes the surrounding lines,
including an unrelated base-branch catch-up merge that never touches the
flagged code at all. Real findings merged to a protected branch unaddressed
under that filter (confirmed in practice: a PR carried five open threads, four
flipped `isOutdated` by catch-up merges with no actual fix behind them, and only
the fifth — never outdated — still showed up). Each comment now carries its
thread's `outdated` flag instead, so the agent is told to verify rather than
trust it.

### Stale-Issue Detector

Open issues, assigned to you (or unassigned with a `needs-triage` label), no
comment/label change since opened past a configurable threshold.

### Review-Request Detector

Open PRs where someone has explicitly requested *your* review — GitHub's
`review-requested:@me` search qualifier, which is not the same set as "PRs
you're involved in" (`involves:@me` covers author/assignee/mentions/commenter,
not review requests). Without this, a PR you were only ever asked to review —
never authored, assigned, or commented on — never surfaces at all; it's a
different failure mode than a stale PR you already own. Severity is high by
default: an explicit ask from a teammate is a stronger signal than general
PR staleness. The qualifier itself tracks "still pending" — GitHub drops you
from it once you submit a review, so there's no separate "already reviewed"
filter to maintain.

### Conflict Detector

`mergeable=CONFLICTING` on your open PRs, plus a *predictive* version: diff the
base branch's commits since the PR's branch point against the files the agent's
current working tree has touched, so a conflict is flagged before GitHub's own
mergeable check catches up.

### Upstream-Drift Detector (demoted — see M3)

A lightweight "session start" marker (branch + base SHA + timestamp, written on
first call per branch) so a later call in the same session can answer "what landed
on the base branch since I started." On reflection this mostly duplicates
`git fetch && git log origin/main..HEAD`, which an agent already runs before
merging as a matter of course — the marker buys a saved round trip, not new
information. Kept as a later, optional detector rather than cut outright, since a
cheap "has upstream moved" ping is still nicer than remembering to run the git
commands, but it doesn't justify M2 priority the way the metadata-drift detectors
below do.

### Metadata-drift detectors (the patch moved, the paper trail didn't)

A different shape of problem from the detectors above: the real state is already
correct, but something that's supposed to track it wasn't updated, so it *reads*
as stale to a reviewer even though it isn't.

*(A prior design here specced an Already-Addressed Detector, using `isOutdated`
as a "likely fixed" signal to downgrade a thread out of the Unresolved-Feedback
Extractor. Removed — see that section above for why `isOutdated` can't carry
that weight. A correct version needs the PR's per-commit changed files to
confirm the *PR's own* commits, not a merge from the base branch, touched the
flagged file after the comment; that's extra GraphQL/REST scope the project
hasn't taken on, so for now an outdated thread just stays in the main list with
a flag, not a separate lower-severity item.)*

**Orphaned-Issue Detector** — cross-check each merged PR's
`closingIssuesReferences` (GraphQL) against the linked issue's current `state`.
Catches the common misses: the PR used "related to #N" instead of a closing
keyword, it merged into a non-default branch so GitHub's auto-close never fired, or
it referenced an issue in a different repo (cross-repo refs don't auto-close at
all).

**Board-Desync Detector** — an issue/PR's GitHub Projects v2 item field (e.g. a
"Status" single-select) still reads "In Progress"/"In Review" after the underlying
issue/PR is actually closed or merged. Needs `ProjectV2Item` field values via
GraphQL, which needs the `project` (or `read:project`) OAuth scope — call out as a
setup check (`gh auth status` scope list), since a token minted without it will
otherwise just see an empty project list and look broken.

### Duplicate-Effort Detector (`orient`'s other detector)

Given an issue number and/or a set of files about to be edited, list any commit (on
any branch) or PR (open, merged, or closed without merging) from the last N days
whose message references that issue number, or whose diff overlaps those files —
each with its timestamp and author. The direct fix for "patched the same issue from
three different angles": this makes "has someone (including an earlier part of this
same session) already tried this" a one-call check instead of something only caught
by chance or by the user noticing. A closed-without-merging PR against the same
issue is itself a signal worth surfacing — it often means an approach was already
tried and abandoned.

## Output contract

`orient` — scoped, chronological, meant to be read in full every time:

```jsonc
{
  "repo": "DanEscher98/agent-radar",
  "generatedAt": "2026-11-18T22:00:00Z",
  "scope": { "issue": 30, "files": ["src/foo.ts"] },
  "orientationSweep": [
    { "at": "2026-11-16T14:02:00Z", "kind": "commit", "sha": "abc1234",
      "author": "...", "message": "fix: ...", "files": ["src/foo.ts"] },
    { "at": "2026-11-17T09:40:00Z", "kind": "pr_closed_unmerged", "pr": 36,
      "title": "attempt: ...", "author": "..." },
    { "at": "2026-11-18T08:15:00Z", "kind": "pr_opened", "pr": 41, "author": "..." }
  ],
  "duplicateEffort": [
    { "at": "2026-11-17T09:40:00Z", "kind": "already_touched", "pr": 36,
      "severity": "high", "detail": "closed without merging, same file, 1 day ago",
      "action": "read PR #36 before starting a new approach — it may already show what didn't work" }
  ]
}
```

`triage` — one JSON digest per call, ranked most-urgent first, every item dated:

```jsonc
{
  "repo": "DanEscher98/agent-radar",
  "generatedAt": "2026-11-18T22:00:00Z",
  "items": [
    { "kind": "conflict", "detector": "Conflict Detector", "pr": 42,
      "severity": "high", "at": "2026-11-18T20:10:00Z", "detail": "...",
      "action": "rebase onto main, resolve src/x.ts" },
    { "kind": "changes_requested", "detector": "Unresolved-Feedback Extractor",
      "pr": 41, "severity": "high",
      "comments": [{ "author": "...", "path": "...", "line": 12, "body": "...",
        "at": "2026-11-17T16:30:00Z", "outdated": false }],
      "action": "address the comment on src/foo.ts:12, then reply" },
    { "kind": "stale_pr", "detector": "PR Health Check", "pr": 39,
      "severity": "medium", "at": "2026-11-14T11:00:00Z", "idleDays": 4,
      "action": "ping for review or close if abandoned" },
    { "kind": "unaddressed_issue", "detector": "Stale-Issue Detector", "issue": 12,
      "severity": "low", "at": "2026-11-10T09:00:00Z", "action": "triage or close" },
    { "kind": "review_requested", "detector": "Review-Request Detector", "pr": 44,
      "severity": "high", "at": "2026-11-18T19:00:00Z",
      "detail": "#44 \"add retries\" is waiting on your review",
      "action": "review" },
    { "kind": "merged_pr_issue_open", "detector": "Orphaned-Issue Detector",
      "pr": 37, "issue": 30, "severity": "medium", "at": "2026-11-16T18:00:00Z",
      "action": "close issue #30, it's done" },
    { "kind": "board_status_stale", "detector": "Board-Desync Detector",
      "issue": 30, "severity": "low", "at": "2026-11-10T09:00:00Z",
      "detail": "board says In Progress, issue has been closed since 2026-11-10",
      "action": "move the board card to Done" }
  ]
}
```

Terse by design — this is read by an LLM's context window, not rendered. Every item
carries `at`, `detector` (which named tool produced it — ties the item back to its
intent, not just its shape), and an `action`. No field that isn't needed to decide,
act, place something in time, or attribute intent goes in. The Upstream-Drift
Detector is omitted here — see its demoted status above; it's documented but not
part of the v1 contract.

## Architecture (phased)

**M1 — core + CLI + skill + invocation wiring — done, tested against a real
repo (pathos-inc/PAMS: 27 real findings, correctly caught PR #843 as duplicate
effort against issue #627).**
- `src/core/` — a plain TS library: `runOrientationSweep`, `runDuplicateEffortCheck`
  (together behind `orient(cwd?, {issue?, files?})`), and `runPrHealthCheck`,
  `runUnresolvedFeedbackExtractor`, `runReviewRequestDetector`,
  `runStaleIssueDetector`, `runConflictDetector`, `runOrphanedIssueDetector`
  (together behind `triage(cwd?)`). Repo + "mine"
  scope resolved from the current directory's git
  remote and the authed `gh` user; all via `@octokit/rest`/GraphQL authed through
  `gh auth token` (shell out once at startup, no separate credential flow).
- The Orientation Sweep and Duplicate-Effort Detector ship in M1, not later —
  they're the direct fix for the same-issue-different-angles failure mode, which is
  the sharpest problem this tool exists to solve, not a nice-to-have alongside
  triage.
- The PR Health Check, Unresolved-Feedback Extractor, Review-Request Detector,
  Stale-Issue Detector, Conflict Detector, and Orphaned-Issue Detector ship
  here too (everything except Board-Desync and the demoted Upstream-Drift
  detector). The Orphaned-Issue Detector rides along for free — same GraphQL
  calls the Unresolved-Feedback Extractor already needs (thread data,
  `closingIssuesReferences`), no new scope. The Review-Request Detector needed
  one new search (`review-requested:@me`) — `involves:@me` doesn't cover
  review requests, so without it a PR you were only asked to review (nothing
  else) never entered the fetch set at all, not just went unflagged.
- Every event/item carries `at`, `detector`, and (where applicable) `action` (see
  Output contract) — these are what make the output worth reading instead of
  re-deriving by hand each time.
- `bin/agent-radar` CLI — `agent-radar triage [--repo owner/name] [--json]` and
  `agent-radar orient [--issue N] [--files a,b,c]`, `--repo` optional everywhere,
  defaulting to `pwd`'s remote.
- A Claude Code skill (`SKILL.md` + thin wrapper script), installable into any
  project, that calls the CLI.
- **The actual deliverable of M1 isn't the skill existing, it's a standing
  instruction to use it** — a `CLAUDE.md` snippet ("run `agent-radar triage` before
  starting or finishing work on an issue, `agent-radar orient --issue N` before
  starting a fix") and/or a `SessionStart` hook that runs `triage` automatically.
  Write both into this repo's own docs as something a project copies in, not just
  the skill file — a tool nobody's told to call isn't more "unprompted" than
  checking `gh` by hand would have been.
- **Published to npm** (not PyPI — checked for a prior Python MCP project under
  `DanEscher98` with an existing PyPI auto-publish pipeline to reuse; found two
  forked MCP servers with real contributions, but neither one's fork or upstream
  actually auto-publishes to PyPI, so there's nothing to inherit either way — npm
  fits the TS/Node implementation directly, no new pattern invented). CI:
  `.github/workflows/npm-publish.yml`, triggered on a GitHub Release (tag `vX.Y.Z`),
  running `npm publish` with an `NPM_TOKEN` repo secret. Package name `agent-radar`
  is unclaimed on the npm registry. Install/run: `npx agent-radar triage` with no
  install step at all, or `npm i -g agent-radar` for a persistent `agent-radar`
  binary — document both in `README.md` once the first version actually publishes.
  Not yet published (no `NPM_TOKEN` secret configured) — installed locally via
  `npm link` in the meantime, see `README.md`.
- The predictive half of the Conflict Detector shipped too, as its own module
  (`predictiveConflictDetector.ts`) rather than folded into the GraphQL-backed
  one: it's local-git-state-dependent (which open PR matches the branch
  currently checked out, whether the working tree's uncommitted changes
  overlap what moved on the base branch since the fork point) and fails
  silently on any git error, since it's a bonus signal, not something to crash
  `triage` over.
- A unit test suite (`vitest`, 31 tests across 12 files) covers every pure
  detector directly and the API-calling ones against a fake `GhContext` — no
  live GitHub calls in CI, per the original plan.
- `README.md`'s "Wire it in" section carries the actual `CLAUDE.md` snippet
  and `SessionStart` hook JSON, not just a description of the idea.
- `agent-radar install-skill` actually installs `SKILL.md` into
  `<cwd>/.claude/skills/agent-radar/`, resolved relative to the installed
  package's own layout (works the same globally, locally, or via `npx`), not
  relative to anything about whichever project happens to run it — this is
  what the skill file was missing before: a real install path into an
  arbitrary project, instead of sitting inert in the npm tarball.

**M2 — Board-Desync Detector — done.** Didn't actually need a scope change:
the account used to test against PAMS (`danieldominguez-pathos`) already had
the `project` scope from earlier work. Tested live against PAMS — it
correctly found zero items, because PAMS has no ProjectV2 board linked at
all (confirmed directly via `gh api graphql`), not because the detector
silently failed; the missing-scope/no-boards degrade-to-empty path is still
in place for accounts that don't have the scope.

**M3 — stretch: Upstream-Drift Detector**
- `.agent-radar/state.json` (repo-local, gitignored) holding a session-start marker
  per branch. Demoted here (see above) since it mostly duplicates a
  `git fetch && git log` an agent already runs before merging — build it only if
  M1/M2 in daily use show it's actually missed.

**M4 — stretch: MCP server**
- `agent-radar mcp` wraps the same `src/core/` library as MCP tools (one per
  detector, named to match: `run_duplicate_effort_detector`, etc.) via
  `@modelcontextprotocol/sdk`. Demoted from its original M3 slot: the thing that
  makes this callable unprompted is the M1 hook/`CLAUDE.md` wiring, not the
  protocol — MCP only helps once a project *can't* install a skill/hook (e.g. an
  agent without filesystem-skill support), which isn't the common case yet.

**M5 — stretch: human-facing digest**
- A scheduled job (cron or GH Action) posting the same ranked `triage` digest to
  Slack/email — addresses the supervisor-visible half of the pain point directly,
  reusing M1's core library. Lowest priority: the agent-facing path is the actual
  ask.

## Tech choices

- TypeScript + Node, `@octokit/rest` for the GitHub GraphQL/REST calls actually needed
  (review threads require GraphQL; PR list/mergeable state is fine over REST).
- No CLI framework needed at this size — hand-rolled argv parsing is enough for the
  handful of subcommands in M1–M3.
- Vitest for tests, against recorded fixtures (no live GitHub calls in CI).
- `@modelcontextprotocol/sdk` for M4 only, if it ends up built at all — not pulled
  in before it's needed.

## Order of work

1. ~~M1 — core + CLI + skill + the hook/`CLAUDE.md` wiring that actually makes it
   get called.~~ Done.
2. ~~M2 — Board-Desync Detector.~~ Done.
3. M3 — Upstream-Drift Detector, only if M1 in daily use shows the git-log
   workaround is actually a recurring friction, not a hypothetical one. Not
   built — that condition hasn't come up.
4. M4 — MCP server, only if a target agent/environment can't use a filesystem
   skill or hook. Not built — hasn't come up.
5. M5 — Slack digest, only if the supervisor-facing angle still matters once
   M1–M4 land. Not built — not yet revisited.
