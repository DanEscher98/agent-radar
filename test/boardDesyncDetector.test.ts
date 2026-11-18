import { describe, expect, it } from "vitest";
import { runBoardDesyncDetector } from "../src/core/detectors/boardDesyncDetector.js";
import { makeCtx } from "./fixtures.js";

function boardWith(content: unknown, status: string | null) {
  return {
    repository: {
      projectsV2: {
        nodes: [
          {
            title: "Roadmap",
            items: { nodes: [{ content, fieldValueByName: status ? { name: status } : null }] },
          },
        ],
      },
    },
  };
}

describe("Board-Desync Detector", () => {
  it("flags a closed issue whose board status isn't a terminal one", async () => {
    const ctx = makeCtx({
      graphql: async () =>
        boardWith({ __typename: "Issue", number: 30, title: "do the thing", state: "CLOSED" }, "In Progress"),
    });
    const items = await runBoardDesyncDetector(ctx);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "board_status_stale", issue: 30 });
  });

  it("ignores a closed item whose board status is already terminal", async () => {
    const ctx = makeCtx({
      graphql: async () => boardWith({ __typename: "Issue", number: 30, title: "x", state: "CLOSED" }, "Done"),
    });
    expect(await runBoardDesyncDetector(ctx)).toHaveLength(0);
  });

  it("ignores a still-open item regardless of status", async () => {
    const ctx = makeCtx({
      graphql: async () => boardWith({ __typename: "Issue", number: 30, title: "x", state: "OPEN" }, "In Progress"),
    });
    expect(await runBoardDesyncDetector(ctx)).toHaveLength(0);
  });

  it("degrades to no findings if the query fails (missing scope, no boards)", async () => {
    const ctx = makeCtx({
      graphql: async () => {
        throw new Error("missing read:project scope");
      },
    });
    expect(await runBoardDesyncDetector(ctx)).toHaveLength(0);
  });
});
