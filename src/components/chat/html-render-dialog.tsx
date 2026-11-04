"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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
      <DialogContent className="html-render-dialog">
        <DialogTitle className="html-render-dialog-title">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Full-screen view of a page from the assistant.
        </DialogDescription>
        <HtmlRenderDocument
          html={html}
          title={title}
          className="html-render-dialog-document"
        />
      </DialogContent>
    </Dialog>
  );
}
