import { describe, expect, it } from "vitest";
import { aSkill } from "@/tests/factories/skill";
import {
  activeSkills,
  defaultSkillIds,
  knownSkillIds,
  storedSkillIdsSchema,
  toggleSkill,
} from "./contracts";

const catalogue = [
  aSkill({ id: "summary", enabledByDefault: true }),
  aSkill({ id: "risk-review", enabledByDefault: true }),
  aSkill({ id: "action-plan", enabledByDefault: false }),
];

describe("defaultSkillIds", () => {
  it("activates the skills marked as enabled by default", () => {
    expect(defaultSkillIds(catalogue)).toEqual(["summary", "risk-review"]);
  });
});

describe("knownSkillIds", () => {
  it.each([
    { stored: ["action-plan"], expected: ["action-plan"] },
    { stored: ["summary", "summary"], expected: ["summary"] },
    { stored: ["removed-skill", "summary"], expected: ["summary"] },
    { stored: [], expected: [] },
  ])("keeps $expected from $stored", ({ stored, expected }) => {
    expect(knownSkillIds(catalogue, stored)).toEqual(expected);
  });
});

describe("toggleSkill", () => {
  it.each([
    {
      enabled: ["summary"],
      id: "action-plan",
      expected: ["summary", "action-plan"],
    },
    {
      enabled: ["summary", "action-plan"],
      id: "summary",
      expected: ["action-plan"],
    },
  ])("toggles $id in $enabled", ({ enabled, id, expected }) => {
    expect(toggleSkill(enabled, id)).toEqual(expected);
  });
});

describe("activeSkills", () => {
  it("lists the active skills in catalogue order", () => {
    expect(
      activeSkills(catalogue, ["action-plan", "summary"]).map(
        (skill) => skill.id,
      ),
    ).toEqual(["summary", "action-plan"]);
  });
});

describe("storedSkillIdsSchema", () => {
  it.each([
    { stored: ["summary", "action-plan"], ids: ["summary", "action-plan"] },
    { stored: ["action-plan", 1, null], ids: ["action-plan"] },
    { stored: [], ids: [] },
  ])("reads $stored as $ids", ({ stored, ids }) => {
    expect(storedSkillIdsSchema.parse(stored)).toEqual(ids);
  });

  it.each([{ skills: ["summary"] }, "summary", null])(
    "rejects %j",
    (stored) => {
      expect(storedSkillIdsSchema.safeParse(stored).success).toBe(false);
    },
  );
});
