import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installSkill } from "../src/core/installSkill.js";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "agent-radar-install-skill-"));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("installSkill", () => {
  it("copies SKILL.md into <cwd>/.claude/skills/agent-radar/ for an arbitrary project", () => {
    const result = installSkill(scratch);
    expect(result.alreadyPresent).toBe(false);
    expect(result.path).toBe(join(scratch, ".claude/skills/agent-radar/SKILL.md"));
    const written = readFileSync(result.path, "utf8");
    expect(written).toContain("agent-radar");
    expect(written).not.toMatch(/PAMS|PathosInc/i);
  });

  it("is idempotent and reports alreadyPresent on a second run", () => {
    installSkill(scratch);
    const second = installSkill(scratch);
    expect(second.alreadyPresent).toBe(true);
  });

  it("respects a custom skills directory", () => {
    const result = installSkill(scratch, ".custom/skills");
    expect(result.path).toBe(join(scratch, ".custom/skills/agent-radar/SKILL.md"));
  });
});
