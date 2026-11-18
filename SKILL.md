---
name: agent-radar
description: Re-ground in what's actually true about the current repo before starting or finishing work on an issue/PR — run `agent-radar orient --issue N` before starting a fix, and `agent-radar triage` before/after working a PR, instead of asking the user for status.
---

# agent-radar

Two tools, both run from inside the repo you're working on (no `--repo` needed
unless you want a different one):

- **`agent-radar orient [--issue N] [--files a,b,c]`** — cheap, call often.
  Returns a dated timeline of recent activity (Orientation Sweep) and whether
  this issue or these files have already been tried, including attempts that
  were abandoned (Duplicate-Effort Detector). Run this *before* starting a fix.
- **`agent-radar triage`** — the fuller sweep: open PRs you own, unresolved
  review feedback (verbatim), stale issues, merge conflicts, and metadata
  drift (threads that look stale but were actually addressed, issues left
  open after their PR merged). Run this at the start and end of working a
  PR/issue.

Both print one JSON object to stdout, ranked/ordered, with a real timestamp
(`at`) and a suggested `action` on every item — read the whole thing, it's
built to be short.
