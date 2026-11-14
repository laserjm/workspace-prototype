import "server-only";
// The skill catalogue: shared data, declared as `catalog/<id>/SKILL.md` files, no owner.
import { z } from "zod";
import type { SkillDetail } from "./contracts";

/**
 * A skill's frontmatter: one `key: value` per line. The folder name is the skill's id and the
 * body is its instructions. `order` sorts the catalogue; folders sort by name.
 */
const frontmatterSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    output: z.string().min(1),
    /** Opening of the example prompt, completed with what is attached: "… these 3 items." */
    prompt: z.string().min(1),
    enabledByDefault: z.enum(["true", "false"]).transform((v) => v === "true"),
    order: z.coerce.number().int(),
  })
  .strict();

type CatalogEntry = { skill: SkillDetail; order: number };

/** Reads one SKILL.md. Throws with the file's path when it is malformed. */
export function parseSkill(path: string, text: string): CatalogEntry {
  const id = path.split("/").at(-2);
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!id || !match)
    throw new Error(`${path}: expected --- frontmatter --- then instructions`);
  const fields = Object.fromEntries(
    match[1]!
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const colon = line.indexOf(":");
        if (colon === -1)
          throw new Error(`${path}: "${line}" is not "key: value"`);
        return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
      }),
  );
  const frontmatter = frontmatterSchema.safeParse(fields);
  if (!frontmatter.success)
    throw new Error(`${path}: ${z.prettifyError(frontmatter.error)}`);
  const instructions = match[2]!.trim();
  if (!instructions) throw new Error(`${path}: the instructions are empty`);
  const { order, ...rest } = frontmatter.data;
  return { skill: { id, ...rest, instructions }, order };
}

/**
 * Every `catalog/<id>/SKILL.md`, bundled with the server code. Each module's `default` is the
 * file's text. Not `import: "default"`: Turbopack (Next 16.4) answers that with `undefined` for a
 * text module.
 */
const files = import.meta.glob<{ default: string }>("./catalog/*/SKILL.md", {
  eager: true,
});

/** The skills in the catalogue, in their `order`. Parsed once; a malformed file fails loudly. */
const catalog: SkillDetail[] = Object.entries(files)
  .map(([path, file]) => parseSkill(path, file.default))
  .sort((a, b) => a.order - b.order)
  .map(({ skill }) => skill);

/** The skills in the catalogue, in their order. */
export async function getSkills(): Promise<SkillDetail[]> {
  return catalog;
}
