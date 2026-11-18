import { describe, expect, it } from "vitest";
import { runStaleIssueDetector } from "../src/core/detectors/staleIssueDetector.js";
import { makeCtx } from "./fixtures.js";

const DAY = 86_400_000;

describe("Stale-Issue Detector", () => {
  it("flags an issue untouched past the threshold", async () => {
    const ctx = makeCtx({
      request: async () => ({
        data: {
          items: [
            {
              number: 12,
              title: "do the thing",
              updated_at: new Date(Date.now() - 10 * DAY).toISOString(),
            },
          ],
        },
      }),
    });
    const items = await runStaleIssueDetector(ctx, 7);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "unaddressed_issue", issue: 12 });
  });

  it("leaves a recently-updated issue alone", async () => {
    const ctx = makeCtx({
      request: async () => ({
        data: { items: [{ number: 12, title: "x", updated_at: new Date().toISOString() }] },
      }),
    });
    expect(await runStaleIssueDetector(ctx, 7)).toHaveLength(0);
  });
});
