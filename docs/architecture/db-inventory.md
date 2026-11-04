# Database code inventory

Every function and trigger in the database, policy helpers included (NX-DB-02). A migration
that adds, changes or drops one changes this file in the same PR; `conventions check` replays
the migrations and compares. Categories:

- **A** atomic claim/lock · **B** read model · **C** constraint/policy helper ·
  **D** platform lifecycle hook · **E** pipeline · **X** legacy, to be ported: allowed while
  its callers are legacy code (NX-LAYER-10, NX-MIG-01); its row names the step that ports it

How `conventions check` reads this file:

- A table counts when it has a `Category` column; its names come from the columns headed
  Name, Function or Trigger (the first column if none is). Split the rows into as many tables
  and sections as you like.
- The Category cell starts with the letter. A trigger NX-DB-08 allows (`updated_at`, audit)
  may say `— (NX-DB-08)` instead.
- A group with no caller, wrapper or test of its own (a data pipeline's functions) can be a
  list under one heading whose text names its category once: "All of them are category E".
- Names under a heading containing "Dropped" or "Removed" do not count as listed.

| Name | Kind | Category | Caller | Wrapped by (repository method) | Test | Contains business rule? | Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
