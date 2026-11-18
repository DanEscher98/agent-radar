import type { GhContext } from "../github.js";
import type { TriageItem } from "../types.js";

const QUERY = `
  query($owner: String!, $repo: String!, $field: String!) {
    repository(owner: $owner, name: $repo) {
      projectsV2(first: 5) {
        nodes {
          title
          items(first: 100) {
            nodes {
              content {
                __typename
                ... on Issue { number title state url }
                ... on PullRequest { number title state url }
              }
              fieldValueByName(name: $field) {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
            }
          }
        }
      }
    }
  }
`;

interface BoardQueryResult {
  repository: {
    projectsV2: {
      nodes: {
        title: string;
        items: {
          nodes: {
            content:
              | { __typename: "Issue"; number: number; title: string; state: "OPEN" | "CLOSED" }
              | { __typename: "PullRequest"; number: number; title: string; state: "OPEN" | "CLOSED" | "MERGED" }
              | null;
            fieldValueByName: { name: string } | null;
          }[];
        };
      }[];
    };
  };
}

/** An issue/PR's Projects v2 "Status" field still reads something like "In
 * Progress" after the underlying item actually closed or merged. Needs the
 * `read:project` (or `project`) OAuth scope on the active `gh` account —
 * degrades to no findings (not an error) if that scope is missing or the
 * repo has no linked ProjectV2 boards, since this detector is a bonus on
 * top of triage, not something to block it over. */
export async function runBoardDesyncDetector(
  ctx: GhContext,
  opts: { fieldName?: string; terminalValues?: string[] } = {},
): Promise<TriageItem[]> {
  const fieldName = opts.fieldName ?? "Status";
  const terminal = new Set((opts.terminalValues ?? ["Done", "Closed", "Merged"]).map((v) => v.toLowerCase()));

  let data: BoardQueryResult;
  try {
    data = await ctx.graphql<BoardQueryResult>(QUERY, {
      owner: ctx.owner,
      repo: ctx.repo,
      field: fieldName,
    });
  } catch {
    return [];
  }

  const items: TriageItem[] = [];
  for (const project of data.repository.projectsV2.nodes) {
    for (const item of project.items.nodes) {
      const content = item.content;
      if (!content) continue;
      const done = content.state === "CLOSED" || content.state === "MERGED";
      if (!done) continue;
      const status = item.fieldValueByName?.name;
      if (status && terminal.has(status.toLowerCase())) continue;

      const base = {
        kind: "board_status_stale",
        detector: "Board-Desync Detector",
        severity: "low" as const,
        at: new Date().toISOString(),
        detail: `"${project.title}" board still shows "${status ?? "no status"}" for #${content.number} "${content.title}", which is already ${content.state.toLowerCase()}`,
        action: "move the board card to its done/closed column",
      };
      items.push(
        content.__typename === "PullRequest"
          ? { ...base, pr: content.number }
          : { ...base, issue: content.number },
      );
    }
  }
  return items;
}
