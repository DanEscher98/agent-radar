# agent-radar

A GitHub context tool built for coding agents to call on themselves, not for a human
to read. Lets an agent re-ground in what's actually true about a repo — instead of
drifting on its own stale picture of it — in one cheap call instead of many ad hoc
`gh` ones.

Two tools:
- **`agent-radar orient`** — cheap, call often mid-session. Runs the
  **Orientation Sweep** (a dated timeline of recent commits/PR/issue activity) and
  the **Duplicate-Effort Detector** (has this issue or these files already been
  tried, including attempts that were abandoned) before you start a fix.
- **`agent-radar triage`** — the fuller sweep, called at the start/end of working a
  PR or issue: PR Health Check, Unresolved-Feedback Extractor, Review-Request
  Detector, Stale-Issue Detector, Conflict Detector, and the metadata-drift
  detectors (Already-Addressed, Orphaned-Issue, Board-Desync) — cases where the
  real state moved on but the tracking around it didn't.

If you want a human-facing dashboard for yourself, use
[gh-dash](https://github.com/dlvhdr/gh-dash) instead — this project deliberately
doesn't duplicate it.

See [DESIGN.md](./DESIGN.md) for the full plan (problem, detectors, phased
architecture, output contract).

## Install

Not published to npm yet (no `NPM_TOKEN` secret configured, so the release
workflow exists but hasn't run). Until then, build and link it locally:

```sh
git clone git@github.com:DanEscher98/agent-radar.git
cd agent-radar
npm install && npm run build
npm link            # puts a global `agent-radar` on your PATH
```

Once published, this collapses to `npx agent-radar triage` / `npm i -g agent-radar`.

## Wire it in

The tool existing isn't what makes it "called unprompted" — a standing
instruction to call it is. Run this once per project (any project — it's not
tied to the one this was built/tested against):

```sh
agent-radar install-skill
```

This copies the packaged `SKILL.md` into `<project>/.claude/skills/agent-radar/`,
the directory Claude Code (and compatible agents) read skills from, so the
tool is discoverable there even without the lines below. It's idempotent —
re-running it just overwrites with the current version.

Then pick one or both of these, for a standing instruction, not just
discoverability:

**A `CLAUDE.md` line** (or equivalent for another agent), in the project being
worked on:

```md
Before starting work on an issue, run `agent-radar orient --issue N` to see
what's already been tried. Before and after working a PR, run
`agent-radar triage` to check for conflicts, unresolved review feedback, and
stale issues — don't wait to be asked.
```

**A `SessionStart` hook**, in that project's `.claude/settings.json`, to run
`triage` automatically at the start of every session (requires `agent-radar`
on `PATH`, see Install above):

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "agent-radar triage 2>/dev/null || true" }] }
    ]
  }
}
```

## Status

M1 and M2 are built and tested against a real repo (see `DESIGN.md`'s
Architecture section for what's in each). Not yet published to npm. The
stretch phases (Upstream-Drift Detector, an MCP server, a Slack digest)
remain gated behind the conditions `DESIGN.md` sets for them — not built
unless those conditions are actually met.
