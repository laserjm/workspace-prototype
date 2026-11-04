/** The latest response is still being prepared. */
export type ThreadStillWorking = {
  _tag: "ThreadStillWorking";
  threadId: string;
};

/** A snooze must end in the future. */
export type SnoozeTimeInPast = { _tag: "SnoozeTimeInPast" };

/** A custom snooze names no date or duration that can be read. */
export type SnoozeTimeUnreadable = { _tag: "SnoozeTimeUnreadable" };

/** A thread's scope names at least one record. */
export type ScopeHasNoRecords = { _tag: "ScopeHasNoRecords" };

export type ThreadError =
  | ThreadStillWorking
  | SnoozeTimeInPast
  | SnoozeTimeUnreadable
  | ScopeHasNoRecords;
