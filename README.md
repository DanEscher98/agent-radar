# agent-radar

A GitHub context tool built for coding agents to call on themselves, not for a human
to read. Answers "what actually needs attention right now" — open PRs, unresolved
review comments (with the actual comment text), merge conflicts, unaddressed issues,
and what changed upstream since the current session started — as one ranked, terse
JSON digest.

If you want a human-facing dashboard for yourself, use
[gh-dash](https://github.com/dlvhdr/gh-dash) instead — this project deliberately
doesn't duplicate it.

See [DESIGN.md](./DESIGN.md) for the full plan (problem, signals, phased
architecture, output contract).

Status: design phase, no code yet.
