import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { Options } from "react-markdown";

type PluggableList = NonNullable<Options["remarkPlugins"]>;

/**
 * The remark plugins messages render with. Module constants, so every block of every message
 * shares them. Raw HTML is not parsed: react-markdown shows it as literal text, and its
 * default URL transform drops unsafe link and image protocols.
 */
export const markdownPlugins: PluggableList = [remarkGfm];

/** For text a person typed, where a single newline is meant as one. */
export const markdownPluginsWithBreaks: PluggableList = [
  remarkGfm,
  remarkBreaks,
];
