# T3 Code

The workspace screen is inspired by [T3 Code](https://github.com/pingdotgg/t3code). Provider and Linux icon paths are adapted from `apps/web/src/components/Icons.tsx`. Response duration formatting is adapted from `packages/shared/src/orchestrationTiming.ts`; message timing and hover controls follow `TimelineRowParts.tsx`, `TimelineAssistantRows.tsx`, and `MessagesTimeline.tsx` in `apps/web/src/components/chat`. These references are at commit `cefb544af3c98224874419198c0359b652ca3c94`.

The source explorer’s neutral surfaces and resize interaction also follow `PullRequestDetailPanel.tsx`, `RightPanelResizeHandle.tsx`, `useResizableWidth.ts`, and `useResizeDrag.ts` in `apps/web/src` at the commit above.

The `html_render` tool is adapted from T3 Code at commit `8b44f42b14c8e273156474a924ccf29680dd7857`: `src/lib/html-render/html-render.ts` from `packages/shared/src/htmlRender.ts` (theme and layout guides, bootstrap injection, frame messages), the viewport height check from `apps/server/src/htmlRender/HtmlRender.ts`, the tool description from `apps/server/src/mcp/toolkits/html/tools.ts` (used by `src/modules/threads/infra/ai-sdk.html-render-tool.ts`), and `src/components/ui/html-render-*.tsx` from `apps/web/src/components/chat/HtmlRenderFrame.tsx` and `HtmlRenderDocument` in `apps/web/src/components/files/BrowserDocumentFrame.tsx`.

MIT License

Copyright (c) 2026 T3 Tools Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
