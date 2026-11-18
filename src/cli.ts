import { parseArgs } from "node:util";
import { triage } from "./core/triage.js";
import { orient } from "./core/orient.js";

const USAGE = `Usage:
  agent-radar triage [--repo owner/name]
  agent-radar orient [--repo owner/name] [--issue N] [--files a,b,c]

Both default --repo to the git remote of the current directory.`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "triage") {
    const { values } = parseArgs({
      args: rest,
      options: { repo: { type: "string" } },
    });
    const result = await triage(process.cwd(), { repo: values.repo });
    print(result);
    return;
  }

  if (command === "orient") {
    const { values } = parseArgs({
      args: rest,
      options: {
        repo: { type: "string" },
        issue: { type: "string" },
        files: { type: "string" },
      },
    });
    const result = await orient(process.cwd(), {
      repo: values.repo,
      issue: values.issue ? Number(values.issue) : undefined,
      files: values.files ? values.files.split(",") : undefined,
    });
    print(result);
    return;
  }

  console.error(USAGE);
  process.exitCode = 1;
}

function print(result: unknown): void {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
