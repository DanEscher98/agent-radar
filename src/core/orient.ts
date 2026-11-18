import { createContext } from "./github.js";
import { runOrientationSweep } from "./detectors/orientationSweep.js";
import { runDuplicateEffortDetector } from "./detectors/duplicateEffortDetector.js";
import type { OrientResult } from "./types.js";

export async function orient(
  cwd: string,
  opts: { repo?: string; issue?: number; files?: string[] } = {},
): Promise<OrientResult> {
  const ctx = await createContext(cwd, opts.repo);
  const scope = { issue: opts.issue, files: opts.files };

  const [orientationSweep, duplicateEffort] = await Promise.all([
    runOrientationSweep(ctx, scope),
    runDuplicateEffortDetector(ctx, scope),
  ]);

  return {
    repo: `${ctx.owner}/${ctx.repo}`,
    generatedAt: new Date().toISOString(),
    scope: { issue: opts.issue ?? null, files: opts.files ?? [] },
    orientationSweep,
    duplicateEffort,
  };
}
