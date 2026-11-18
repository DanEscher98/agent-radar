import { describe, expect, it } from "vitest";
import { runOrientationSweep } from "../src/core/detectors/orientationSweep.js";
import { makeCtx } from "./fixtures.js";

describe("Orientation Sweep", () => {
  it("merges commits and PR events into one chronological timeline", async () => {
    const ctx = makeCtx({
      listCommits: async () => ({
        data: [
          {
            sha: "abc1234",
            commit: { message: "fix: x\n\nbody", author: { date: "2026-11-16T14:02:00Z" } },
            author: { login: "alice" },
          },
        ],
      }),
      request: async () => ({
        data: {
          items: [
            {
              number: 41,
              title: "a PR",
              state: "open",
              created_at: "2026-11-18T08:15:00Z",
              closed_at: null,
              user: { login: "bob" },
              pull_request: { merged_at: null },
            },
          ],
        },
      }),
    });
    const events = await runOrientationSweep(ctx, {});
    expect(events).toHaveLength(2);
    expect(events[0].at < events[1].at).toBe(true);
    expect(events.find((e) => e.kind === "commit")).toMatchObject({ sha: "abc1234", author: "alice" });
    expect(events.find((e) => e.kind === "pr_opened")).toMatchObject({ pr: 41, author: "bob" });
  });
});
