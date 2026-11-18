import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolved relative to the installed package's own layout (this compiles to
// dist/core/installSkill.js, two levels under the package root, where
// SKILL.md ships — see package.json's "files"), not relative to the caller's
// cwd, so this works the same whether agent-radar is installed globally,
// locally, or run via npx.
const PACKAGED_SKILL_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "SKILL.md");

export interface InstallSkillResult {
  path: string;
  alreadyPresent: boolean;
}

/** Copies the packaged SKILL.md into `<cwd>/<skillsDir>/agent-radar/SKILL.md` —
 * the directory Claude Code (and compatible agents) reads skills from. No
 * assumption about which project this is; works identically anywhere. */
export function installSkill(cwd: string, skillsDir = ".claude/skills"): InstallSkillResult {
  const targetDir = join(cwd, skillsDir, "agent-radar");
  const targetPath = join(targetDir, "SKILL.md");
  const alreadyPresent = existsSync(targetPath);
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(targetPath, readFileSync(PACKAGED_SKILL_PATH, "utf8"));
  return { path: targetPath, alreadyPresent };
}
