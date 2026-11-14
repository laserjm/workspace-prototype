// Adapted from T3 Code's packages/shared/src/htmlRender.ts and the html_render
// tool in apps/server/src/mcp/toolkits/html (MIT). See THIRD_PARTY_NOTICES.md.
//
// What the client frame needs to show a page: its theme and the bootstrap that reports the
// page's height and links. No React, no Node APIs. The tool's limits and checks are the agent's
// (modules/agent/contracts.ts, tools.ts).

import { z } from "zod";

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
