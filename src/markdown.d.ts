// A .md file imports as its text: Turbopack's `text` module type (next.config.ts) in the app,
// the `markdownAsText` plugin (vitest.config.mts) in tests.
declare module "*.md" {
  const text: string;
  export default text;
}
