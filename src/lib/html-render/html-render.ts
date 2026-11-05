// Adapted from T3 Code's packages/shared/src/htmlRender.ts and the html_render
// tool in apps/server/src/mcp/toolkits/html (MIT). See THIRD_PARTY_NOTICES.md.
//
// Shared by the server tool and the client frame: no React, no Node APIs.

import { z } from "zod";

export const HTML_RENDER_TOOL_NAME = "html_render";
export const HTML_RENDER_MIN_HEIGHT = 80;
export const HTML_RENDER_MAX_HEIGHT = 2000;
// The client fits the frame to the live page up to this height. It only stops a
// page that grows with its frame, since vh units are rejected by the tool.
export const HTML_RENDER_MAX_FIT_HEIGHT = 20_000;
export const HTML_RENDER_MAX_TITLE_LENGTH = 200;
export const HTML_RENDER_MAX_HTML_LENGTH = 512_000;
export const HTML_RENDER_COLUMN_WIDTH = 856;

export function clampHtmlRenderHeight(height: number): number {
  return Math.min(
    HTML_RENDER_MAX_HEIGHT,
    Math.max(HTML_RENDER_MIN_HEIGHT, Math.round(height)),
  );
}

export function normalizeHtmlRenderTitle(title: string): string {
  return title.trim().slice(0, HTML_RENDER_MAX_TITLE_LENGTH) || "HTML";
}

/**
 * A page even a few pixels taller than its frame scrolls inside it and takes
 * the reader's scroll, so the frame fits the page. Once the live page reports
 * its height, that wins over the model's estimate.
 */
export function htmlRenderFrameHeight(height: number, contentHeight?: number) {
  if (contentHeight !== undefined) {
    return Math.min(
      HTML_RENDER_MAX_FIT_HEIGHT,
      Math.max(HTML_RENDER_MIN_HEIGHT, Math.ceil(contentHeight)),
    );
  }
  return clampHtmlRenderHeight(height);
}

export const HTML_RENDER_THEME_GUIDE = [
  "Use theme CSS variables on :root, not fixed colors:",
  "--background, --foreground, --muted, --card, --popover, --secondary, --border, --ring, --primary, --accent, --destructive, --warning, --success, --info, --code-background",
  "(most have a matching -foreground; accent, destructive, and warning also have -surface),",
  "--chart-1 to --chart-6, --radius, --font-sans, --font-mono.",
  "The base sheet sets background, text, and font.",
].join(" ");

export const HTML_RENDER_LAYOUT_GUIDE = [
  `Frame width is reply width (up to ${HTML_RENDER_COLUMN_WIDTH}px desktop, about 360px phones), on the thread background.`,
  "Leave html, body, and the outer element with no background color, no outer card, border, banner title, or side padding. This wins over any rule that sets a page background.",
  "The host adds an overridable 8px html gutter for selection rings and shadows. Use fluid widths within it.",
  "A box that needs its own background gets 16px padding and var(--radius) corners. Give charts fixed pixel heights.",
  "Let content set the height. Do not use vh units or height:100% on html or body. Both are rejected or loop.",
].join(" ");

export const HTML_RENDER_PAGE_RULES =
  "Write a complete, self-contained document. Inline <style> and <script>. Remote URLs (for example a chart library from a CDN) load as-is.";

export const HTML_RENDER_DESCRIPTION = `Show a finished HTML page (chart, dashboard, mockup, a long or sortable table, or a diagram Mermaid cannot draw) inline in this thread, above your final reply. Use it when a visual makes the answer clearer or the user asks for one. Do not announce or restate the page. Frame fits height up to ${HTML_RENDER_MAX_FIT_HEIGHT}px. ${HTML_RENDER_PAGE_RULES} ${HTML_RENDER_LAYOUT_GUIDE} ${HTML_RENDER_THEME_GUIDE}`;

// Check only stylesheets and style attributes, even inside scripts; skip comments whole.
// Consume unclosed comments, tags, or quotes through EOF to keep both patterns linear.
const CSS_SOURCE =
  /<!--[\s\S]*?(?:-->|$)|<style\b[^>]*(?:>|$)([\s\S]*?)(?:<\/style\s*>|$)|\sstyle\s*=\s*(?:"([^"]*)(?:"|$)|'([^']*)(?:'|$)|([^\s>]+))/gi;
// The lookbehind skips base64 runs, such as an inlined image that happens to contain "1vh".
const VIEWPORT_HEIGHT_UNIT =
  /(?<![\w.+/])(?:\d+(?:\.\d+)?|\.\d+)[sld]?vh(?![\w-])/i;

/** Returns the first viewport height unit in the page's CSS, if any. */
export function findViewportHeightUnit(html: string): string | undefined {
  for (const [, sheet, doubleQuoted, singleQuoted, unquoted] of html.matchAll(
    CSS_SOURCE,
  )) {
    const css = sheet ?? doubleQuoted ?? singleQuoted ?? unquoted ?? "";
    const found = VIEWPORT_HEIGHT_UNIT.exec(css)?.[0];
    if (found !== undefined) return found;
  }
  return undefined;
}

export function viewportHeightErrorMessage(found: string) {
  return `The page uses a viewport height unit (${found}). The frame grows to fit the page, so a size that follows the viewport makes it grow again and again. Let content set the height, or use fixed pixel heights.`;
}

export interface HtmlRenderTheme {
  readonly appearance: "light" | "dark";
  readonly variables: Readonly<Record<string, string>>;
}

export const HTML_RENDER_DEFAULT_FONTS = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  // Concrete names only: some engines alias `ui-monospace` to the proportional UI font.
  mono: '"SF Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace',
} as const;

/** The workspace's light palette (see src/app/globals.css), as html_render tokens. */
export const WORKSPACE_HTML_RENDER_THEME: HtmlRenderTheme = {
  appearance: "light",
  variables: {
    "--background": "#fdfdfd",
    "--foreground": "#252527",
    "--muted": "#f4f4f6",
    "--muted-foreground": "#787883",
    "--card": "#ffffff",
    "--card-foreground": "#252527",
    "--popover": "#ffffff",
    "--popover-foreground": "#252527",
    "--secondary": "#efeff2",
    "--secondary-foreground": "#32323b",
    "--border": "#e7e7ec",
    "--input": "#e5e5e7",
    "--ring": "#a1a1aa",
    "--primary": "#252527",
    "--primary-foreground": "#fdfdfd",
    "--accent": "#4f6bed",
    "--accent-foreground": "#ffffff",
    "--accent-surface": "#eef1fd",
    "--accent-surface-foreground": "#3249b8",
    "--destructive": "#dc2626",
    "--destructive-foreground": "#b91c1c",
    "--destructive-surface": "#fdeeee",
    "--warning": "#d97706",
    "--warning-foreground": "#b45309",
    "--warning-surface": "#fdf4e7",
    "--success": "#10b981",
    "--success-foreground": "#047857",
    "--info": "#3b82f6",
    "--info-foreground": "#1d4ed8",
    "--code-background": "#f4f4f6",
    "--code-foreground": "#32323b",
    "--chart-1": "#4f6bed",
    "--chart-2": "#0d9488",
    "--chart-3": "#d97706",
    "--chart-4": "#9333ea",
    "--chart-5": "#e11d48",
    "--chart-6": "#65a30d",
    "--radius": "0.625rem",
    "--font-sans": HTML_RENDER_DEFAULT_FONTS.sans,
    "--font-mono": HTML_RENDER_DEFAULT_FONTS.mono,
  },
};

const OPEN_LINK_METHOD = "ui/open-link";
const SIZE_CHANGED_METHOD = "ui/notifications/size-changed";

// Messages from the sandboxed frame are untrusted: parse them, never cast.
const sizeChangedMessageSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.literal(SIZE_CHANGED_METHOD),
  params: z.object({ height: z.number().positive() }),
});

const openLinkMessageSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.literal(OPEN_LINK_METHOD),
  params: z.object({ url: z.string().regex(/^https?:\/\//i) }),
});

export function readHtmlRenderContentHeight(data: unknown): number | undefined {
  const message = sizeChangedMessageSchema.safeParse(data);
  return message.success ? message.data.params.height : undefined;
}

export function readHtmlRenderLinkRequest(
  data: unknown,
): { readonly url: string } | undefined {
  const message = openLinkMessageSchema.safeParse(data);
  return message.success ? { url: message.data.params.url } : undefined;
}

const BASE_CSS =
  "html{box-sizing:border-box;padding:8px;background:var(--background);color:var(--foreground);font-family:var(--font-sans);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;scrollbar-width:none}" +
  "html::-webkit-scrollbar{display:none}body{margin:0}code,kbd,pre,samp{font-family:var(--font-mono)}" +
  // Focus outlines paint inside the element, so the frame edge never clips them.
  ":where(:focus-visible){outline:2px solid var(--ring)}:focus-visible{outline-width:2px!important;outline-offset:-2px!important}";

function themeCss(theme: HtmlRenderTheme): string {
  const declarations = Object.entries(theme.variables)
    .map(([name, value]) => `${name}:${value};`)
    .join("");
  return `:root{color-scheme:${theme.appearance};${declarations}}${BASE_CSS}`;
}

// Forwards link clicks to the host (the sandbox blocks navigation and popups)
// and reports the page height so the host frame can fit it.
const BOOTSTRAP_SCRIPT = `(function(){document.addEventListener("click",function(e){var l=e.isTrusted?e.composedPath().find(function(t){return t&&t.matches&&t.matches("a[href]");}):null,u;if(!l)return;try{u=new URL(l.getAttribute("href"),document.baseURI);}catch(x){return;}if(!/^https?:$/.test(u.protocol))return;e.preventDefault();window.parent.postMessage({jsonrpc:"2.0",method:${JSON.stringify(OPEN_LINK_METHOD)},params:{url:u.href}},"*");},true);var h,o,z=function(){var r=document.documentElement,v=Math.ceil(r.scrollHeight>r.clientHeight?r.scrollHeight:r.getBoundingClientRect().height);if(v===h)return;h=v;window.parent.postMessage({jsonrpc:"2.0",method:${JSON.stringify(SIZE_CHANGED_METHOD)},params:{height:v}},"*");};if(window.ResizeObserver){o=new ResizeObserver(z);o.observe(document.documentElement);}document.addEventListener("DOMContentLoaded",function(){if(o&&document.body)o.observe(document.body);z();});window.addEventListener("load",z);})();`;

function bootstrapMarkup(markup: string, theme: HtmlRenderTheme): string {
  return [
    /<meta\s[^>]*charset/i.test(markup.slice(0, 4096))
      ? ""
      : '<meta charset="utf-8">',
    /<meta\s[^>]*name\s*=\s*["']?viewport/i.test(markup)
      ? ""
      : '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style id="workspace-theme">${themeCss(theme)}</style>`,
    `<script>${BOOTSTRAP_SCRIPT}</script>`,
  ].join("");
}

// Blank inert content without shifting offsets so it cannot receive the bootstrap.
const blankNonMarkup = (html: string) => {
  const scan = html.replace(
    /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|title|xmp|iframe|noembed|noframes|noscript)\b[\s\S]*?(?:<\/\1\s*>|$)|<plaintext\b[\s\S]*$/gi,
    (match) => " ".repeat(match.length),
  );
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let at = 0;
  for (const match of scan.matchAll(/<(\/?)template(?:\s[^>]*)?\/?>/gi)) {
    if (!match[1]) {
      if (depth++ === 0) start = match.index;
    } else if (depth > 0 && --depth === 0) {
      const end = match.index + match[0].length;
      parts.push(scan.slice(at, start), " ".repeat(end - start));
      at = end;
    }
  }
  if (depth > 0) {
    parts.push(scan.slice(at, start), " ".repeat(scan.length - start));
    at = scan.length;
  }
  parts.push(scan.slice(at));
  return parts.join("");
};

/** Puts the theme sheet and host bridge first in <head>, before page styles. */
export function injectHtmlRenderBootstrap(
  html: string,
  theme: HtmlRenderTheme = WORKSPACE_HTML_RENDER_THEME,
): string {
  const scan = blankNonMarkup(html);
  const markup = bootstrapMarkup(scan, theme);
  const headOpen = /<head(?:\s[^>]*)?>/i.exec(scan);
  if (headOpen) {
    const at = headOpen.index + headOpen[0].length;
    return html.slice(0, at) + markup + html.slice(at);
  }
  const htmlOpen = /<html(?:\s[^>]*)?>/i.exec(scan);
  if (htmlOpen) {
    const at = htmlOpen.index + htmlOpen[0].length;
    return `${html.slice(0, at)}<head>${markup}</head>${html.slice(at)}`;
  }
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) {
    const at = doctype[0].length;
    return `${html.slice(0, at)}<head>${markup}</head>${html.slice(at)}`;
  }
  return `<!doctype html><head>${markup}</head>${html}`;
}
