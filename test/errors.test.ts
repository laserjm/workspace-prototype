// Every module's errors.ts lists all of its error classes, so the adapters' exhaustive
// `switch`es (app/(workspace)/refusals.ts, the thread messages route) see each one. A class left
// out of the list would pass the compiler and reach the browser as a bug.
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const modulesDir = path.resolve(import.meta.dirname, "../modules");
const withErrors = readdirSync(modulesDir).filter((name) =>
  existsSync(path.join(modulesDir, name, "errors.ts")),
);

const isErrorClass = (value: unknown): value is new (...args: never[]) => Error =>
  typeof value === "function" && value.prototype instanceof Error;

describe.each(withErrors)("modules/%s/errors.ts", (name) => {
  it("lists every error class it exports, each named after its class", async () => {
    const exports: Record<string, unknown> = await import(`../modules/${name}/errors.ts`);
    const lists = Object.entries(exports).filter(
      ([key, value]) => key.endsWith("Errors") && Array.isArray(value),
    );
    expect(lists).toHaveLength(1);
    const list = lists[0]?.[1];
    const listed: unknown[] = Array.isArray(list) ? list : [];

    const classes = Object.entries(exports).filter(([, value]) => isErrorClass(value));
    expect(classes.length).toBeGreaterThan(0);
    for (const [exportName, type] of classes) {
      expect(listed, exportName).toContain(type);
      if (!isErrorClass(type)) continue;
      // The literal `name` is what the adapters switch on. Arrays stand in for any argument: they
      // print in a message and join like a list.
      expect(Reflect.construct(type, [["a"], ["b"], ["c"]]).name).toBe(exportName);
    }
    expect(listed).toHaveLength(classes.length);
  });
});
