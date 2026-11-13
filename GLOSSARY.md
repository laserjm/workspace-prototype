# Workspace

A workspace where a signed-in user asks an AI about work held in the systems they connect,
thread by thread.

## Connected systems

**Provider**:
A system the workspace can connect to, such as GitHub or Confluence.
_Avoid_: Integration, data source, vendor

**Connection**:
One user's authenticated link to one account or site of a provider. It is what the user picks
when they choose where to bring items in from.
_Avoid_: Data source, source, account, integration

**Record**:
One item a connection's provider holds, such as an issue, a pull request or a page, as its provider has it.
_Avoid_: Item, entry, ticket (as a generic term)

## Threads

**Attached item**:
A record the user picked to ask about, held by reference on the message that asks about it. A
thread's attached items are those of its messages.
_Avoid_: Scope record, selected record, context item

**Attached connection**:
A connection the user attached to a message, with or without items, so the agent may use it for
the rest of the thread.
_Avoid_: Scope, fence

## The panel

**Record view**:
How the workspace shows one record in the right-hand panel, in a form made for its kind, such as a GitHub pull request or a Confluence page.
_Avoid_: Explorer, detail page, surface

**View kind**:
The kind of record view a record opens in, named by its provider and what it shows, such as `github.issue-view`, `github.pull-request-view` or `confluence.page-view`.
_Avoid_: View type, renderer

**Pinned view**:
The one record view a thread keeps in place at the top of the panel while the user switches between the others.
_Avoid_: Split, docked view
