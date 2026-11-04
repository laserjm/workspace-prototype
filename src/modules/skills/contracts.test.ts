import { describe, expect, it } from "vitest";
import { storedSkillIdsSchema } from "./contracts";

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
