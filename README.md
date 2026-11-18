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
  PR or issue: PR Health Check, Unresolved-Feedback Extractor, Stale-Issue
  Detector, Conflict Detector, and the metadata-drift detectors (Already-Addressed,
  Orphaned-Issue, Board-Desync) — cases where the real state moved on but the
  tracking around it didn't.

If you want a human-facing dashboard for yourself, use
[gh-dash](https://github.com/dlvhdr/gh-dash) instead — this project deliberately
doesn't duplicate it.

See [DESIGN.md](./DESIGN.md) for the full plan (problem, detectors, phased
architecture, output contract).

Status: design phase, no code yet.
