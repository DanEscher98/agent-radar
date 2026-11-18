import { describe, expect, it } from "vitest";
import { runPrHealthCheck } from "../src/core/detectors/prHealthCheck.js";
import { makePr } from "./fixtures.js";

const DAY = 86_400_000;

describe("PR Health Check", () => {
  it("flags a PR idle for 3+ days, escalating past 6", () => {
    const now = Date.now();
    const items = runPrHealthCheck([
      makePr({ number: 1, updatedAt: new Date(now - 4 * DAY).toISOString() }),
      makePr({ number: 2, updatedAt: new Date(now - 8 * DAY).toISOString() }),
    ]);
    const byPr = Object.fromEntries(items.map((i) => [i.pr, i]));
    expect(byPr[1]).toMatchObject({ kind: "stale_pr", severity: "medium" });
    expect(byPr[2]).toMatchObject({ kind: "stale_pr", severity: "high" });
  });

  it("leaves a recently-updated PR alone", () => {
    const items = runPrHealthCheck([makePr({ number: 1, updatedAt: new Date().toISOString() })]);
    expect(items.filter((i) => i.kind === "stale_pr")).toHaveLength(0);
  });

  it("flags failing CI separately from staleness", () => {
    const items = runPrHealthCheck([
      makePr({ number: 1, updatedAt: new Date().toISOString(), checkState: "FAILURE" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "ci_failing", severity: "high" });
  });
});
