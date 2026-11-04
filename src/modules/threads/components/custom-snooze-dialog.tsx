"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { customSnoozeTime } from "../domain/snooze";
import type { Thread } from "../domain/thread";
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
      <DialogContent className="custom-snooze-dialog">
        <DialogHeader>
          <DialogTitle>Custom snooze</DialogTitle>
          <DialogDescription>
            Choose when “{thread.title}” returns to your active sessions.
          </DialogDescription>
        </DialogHeader>
        <form
          className="workspace-dialog-form custom-snooze-form"
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
          <div className="snooze-mode-picker" aria-label="Snooze schedule">
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
              <label htmlFor="snooze-date">Return at (local time)</label>
              <input
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
              <label htmlFor="snooze-minutes">Snooze for (minutes)</label>
              <input
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
            <p role="alert" className="snooze-error">
              {error}
            </p>
          )}
          <div className="snooze-dialog-actions">
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
