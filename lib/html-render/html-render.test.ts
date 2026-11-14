import { describe, expect, it } from "vitest";
import {
  readHtmlRenderContentHeight,
  readHtmlRenderLinkRequest,
} from "./html-render";

const sizeChanged = (params: unknown) => ({
  jsonrpc: "2.0",
  method: "ui/notifications/size-changed",
  params,
});
const openLink = (params: unknown) => ({
  jsonrpc: "2.0",
  method: "ui/open-link",
  params,
});

describe("readHtmlRenderContentHeight", () => {
  it.each([
    { data: sizeChanged({ height: 320 }), height: 320 },
    { data: sizeChanged({ height: 12.5, width: 4 }), height: 12.5 },
    { data: sizeChanged({ height: 0 }), height: undefined },
    { data: sizeChanged({ height: -4 }), height: undefined },
    { data: sizeChanged({ height: Number.NaN }), height: undefined },
    {
      data: sizeChanged({ height: Number.POSITIVE_INFINITY }),
      height: undefined,
    },
    { data: sizeChanged({ height: "320" }), height: undefined },
    { data: sizeChanged(null), height: undefined },
    {
      data: { ...sizeChanged({ height: 320 }), jsonrpc: "1.0" },
      height: undefined,
    },
    { data: openLink({ height: 320 }), height: undefined },
    { data: "size-changed", height: undefined },
    { data: null, height: undefined },
  ])("reads $data as $height", ({ data, height }) => {
    expect(readHtmlRenderContentHeight(data)).toBe(height);
  });
});

describe("readHtmlRenderLinkRequest", () => {
  it.each([
    {
      data: openLink({ url: "https://example.com/a" }),
      url: "https://example.com/a",
    },
    {
      data: openLink({ url: "HTTP://example.com" }),
      url: "HTTP://example.com",
    },
    { data: openLink({ url: "javascript:alert(1)" }), url: undefined },
    { data: openLink({ url: "/relative" }), url: undefined },
    { data: openLink({}), url: undefined },
    { data: openLink(null), url: undefined },
    { data: sizeChanged({ url: "https://example.com" }), url: undefined },
    { data: undefined, url: undefined },
  ])("reads $data as $url", ({ data, url }) => {
    expect(readHtmlRenderLinkRequest(data)).toEqual(url ? { url } : undefined);
  });
});
