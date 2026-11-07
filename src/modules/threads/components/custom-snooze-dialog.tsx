"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { customSnoozeTime } from "../placement";
import type { Thread } from "../contracts";
import { toLocalDateTime } from "./time-format";
import { useChatStore } from "./use-chat-store";

export function CustomSnoozeDialog({
  thread,
  onClose,
  onSnooze,
}: {
  thread: Thread;
  onClose: () => void;
  onSnooze: (until: string) => void;
}) {
  const chatStore = useChatStore();
  const [mode, setMode] = useState<"date" | "duration">("date");
  const [date, setDate] = useState(() =>
    toLocalDateTime(new Date(Date.now() + 3_600_000)),
  );
  const [minutes, setMinutes] = useState("30");
  const [error, setError] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto wrap-anywhere">
        <DialogHeader>
          <DialogTitle>Custom snooze</DialogTitle>
          <DialogDescription>
            Choose when “{thread.title}” returns to your active sessions.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const until = customSnoozeTime(
              mode === "date"
                ? { mode, localDateTime: date }
                : { mode, minutes },
              new Date(),
            );
            if (!until.ok) {
              // Unreadable and past times get the same hint for each mode.
              setError(
                mode === "date"
                  ? "Choose a valid date and time in the future."
                  : "Enter a positive number of minutes.",
              );
              return;
            }
            if (chatStore.isWorking(thread.id)) {
              setError("Wait for the response to finish before snoozing.");
              return;
            }
            onSnooze(until.value.toISOString());
          }}
        >
          <div
            className="flex gap-1 rounded-md bg-accent p-1 [&>button]:flex-1 [&>button]:rounded-sm [&>button]:p-1.5 [&>button]:text-xs [&>button]:text-secondary-label [&>button]:aria-pressed:bg-card [&>button]:aria-pressed:text-secondary-foreground [&>button]:aria-pressed:shadow-xs"
            aria-label="Snooze schedule"
          >
            <button
              type="button"
              aria-pressed={mode === "date"}
              onClick={() => {
                setMode("date");
                setError("");
              }}
            >
              Date and time
            </button>
            <button
              type="button"
              aria-pressed={mode === "duration"}
              onClick={() => {
                setMode("duration");
                setError("");
              }}
            >
              Duration
            </button>
          </div>
          {mode === "date" ? (
            <>
              <label htmlFor="snooze-date" className="text-xs font-medium">
                Return at (local time)
              </label>
              <Input
                id="snooze-date"
                type="datetime-local"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setError("");
                }}
                required
              />
            </>
          ) : (
            <>
              <label htmlFor="snooze-minutes" className="text-xs font-medium">
                Snooze for (minutes)
              </label>
              <Input
                id="snooze-minutes"
                type="number"
                min="1"
                max="525600"
                step="1"
                value={minutes}
                onChange={(event) => {
                  setMinutes(event.target.value);
                  setError("");
                }}
                required
              />
            </>
          )}
          {error && (
            <p role="alert" className="text-xs text-destructive-foreground">
              {error}
            </p>
          )}
          <div className="mt-1.5 flex justify-end gap-1.5">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Snooze session</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
