"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./dialog";
import { HtmlRenderDocument } from "./html-render-document";

export function HtmlRenderDialog({
  html,
  title,
  onClose,
}: {
  html: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex h-[calc(100svh-3rem)] w-[min(1200px,calc(100vw-3rem))] max-w-none flex-col gap-3 bg-background sm:max-w-none">
        <DialogTitle className="pr-8 text-sm font-medium">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Full-screen view of a page from the assistant.
        </DialogDescription>
        <HtmlRenderDocument
          html={html}
          title={title}
          className="min-h-0 w-full flex-1 border-0"
        />
      </DialogContent>
    </Dialog>
  );
}
