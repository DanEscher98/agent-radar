import { describe, expect, it, vi } from "vitest";
import { makePr } from "./fixtures.js";

async function importWithMockedGit(responses: Record<string, string>) {
  vi.resetModules();
  vi.doMock("node:child_process", () => ({
    execFileSync: vi.fn((_cmd: string, args: string[]) => {
      const key = Object.keys(responses).find((candidate) => args.join(" ").startsWith(candidate));
      if (key === undefined) throw new Error(`unmocked git invocation: ${args.join(" ")}`);
      return responses[key];
    }),
  }));
  return import("../src/core/detectors/predictiveConflictDetector.js");
}

describe("Conflict Detector (predictive)", () => {
  it("flags an overlap between local changes and what moved on the base branch", async () => {
    const { runPredictiveConflictDetector } = await importWithMockedGit({
      "rev-parse": "feature",
      fetch: "",
      "merge-base": "base-sha",
      "diff --name-only base-sha": "src/foo.ts\nsrc/bar.ts",
      "diff --name-only HEAD": "src/foo.ts",
      "diff --name-only --cached": "",
    });
    const pr = makePr({ number: 41, headRefName: "feature", baseRefName: "main", mergeable: "MERGEABLE" });
    const items = runPredictiveConflictDetector("/repo", [pr]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "predicted_conflict", pr: 41, severity: "medium" });
  });

  it("stays quiet when no open PR matches the checked-out branch", async () => {
    const { runPredictiveConflictDetector } = await importWithMockedGit({ "rev-parse": "unrelated-branch" });
    const pr = makePr({ headRefName: "feature" });
    expect(runPredictiveConflictDetector("/repo", [pr])).toHaveLength(0);
  });

  it("stays quiet (doesn't throw) on a git error", async () => {
    vi.resetModules();
    vi.doMock("node:child_process", () => ({
      execFileSync: vi.fn(() => {
        throw new Error("not a git repo");
      }),
    }));
    const { runPredictiveConflictDetector } = await import("../src/core/detectors/predictiveConflictDetector.js");
    expect(runPredictiveConflictDetector("/repo", [makePr()])).toHaveLength(0);
  });
});
