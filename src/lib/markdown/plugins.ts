import { defaultUrlTransform, type Options } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

type PluggableList = NonNullable<Options["remarkPlugins"]>;

// Only $$…$$ is math: with single dollars, "between $5 and $10" would typeset "5 and ".
const math: PluggableList[number] = [remarkMath, { singleDollarTextMath: false }];

/**
 * The remark plugins messages render with. Module constants, so every block of every message
 * shares them. Raw HTML is not parsed: react-markdown shows it as literal text.
 */
export const markdownPlugins: PluggableList = [remarkGfm, math];

/** For text a person typed, where a single newline is meant as one. */
export const markdownPluginsWithBreaks: PluggableList = [
  remarkGfm,
  math,
  remarkBreaks,
];

/**
 * react-markdown's default, which drops unsafe protocols, except that a link may keep a
 * `file:` URL: it renders as a file chip, never as a link or an image.
 */
export const markdownUrlTransform: NonNullable<Options["urlTransform"]> = (
  url,
  key,
) =>
  key === "href" && url.startsWith("file:") ? url : defaultUrlTransform(url);
