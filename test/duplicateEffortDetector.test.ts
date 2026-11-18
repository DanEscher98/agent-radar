import { describe, expect, it } from "vitest";
import { runDuplicateEffortDetector } from "../src/core/detectors/duplicateEffortDetector.js";
import { makeCtx } from "./fixtures.js";

describe("Duplicate-Effort Detector", () => {
  it("flags a PR closed without merging against the given issue, as high severity", async () => {
    const ctx = makeCtx({
      request: async () => ({
        data: {
          items: [
            {
              number: 36,
              title: "attempt",
              state: "closed",
              created_at: "2026-11-17T00:00:00Z",
              closed_at: "2026-11-17T09:40:00Z",
              pull_request: { merged_at: null },
            },
          ],
        },
      }),
    });
    const items = await runDuplicateEffortDetector(ctx, { issue: 30 });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ pr: 36, severity: "high" });
  });

  it("flags a PR still open against the given issue, as medium severity", async () => {
    const ctx = makeCtx({
      request: async () => ({
        data: {
          items: [
            {
              number: 41,
              title: "in flight",
              state: "open",
              created_at: "2026-11-18T08:15:00Z",
              closed_at: null,
              pull_request: { merged_at: null },
            },
          ],
        },
      }),
    });
    const items = await runDuplicateEffortDetector(ctx, { issue: 30 });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ pr: 41, severity: "medium" });
  });

  it("flags a recent commit touching a given file, as low severity", async () => {
    const ctx = makeCtx({
      listCommits: async () => ({
        data: [{ sha: "abc1234", commit: { message: "fix: x", author: { date: "2026-11-16T14:02:00Z" } } }],
      }),
    });
    const items = await runDuplicateEffortDetector(ctx, { files: ["src/foo.ts"] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ sha: "abc1234", severity: "low" });
  });
});
