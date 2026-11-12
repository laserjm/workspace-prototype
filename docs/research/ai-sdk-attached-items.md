# Carrying attached items on a message in AI SDK 7

Research for [#39](https://github.com/laserjm/workspace-prototype/issues/39), part of the
wayfinder map [#36](https://github.com/laserjm/workspace-prototype/issues/36).

**Question.** How does AI SDK 7 let a user message carry **attached items** (references to
records) beside its text and file parts, so they are stored with the message, validated on the
server and shown in the chat? How do they become model input, and how does `ToolLoopAgent`'s
`prepareCall` pick the tools per call?

**Versions read.** `ai` 7.0.162 and `@ai-sdk/react` 4.0.166, as installed from `package.json`
(`"ai": "^7.0.162"`, `"@ai-sdk/react": "^4.0.166"`). Every source below is the installed package
in `node_modules/ai/` (its `src/` and `docs/`) unless it says otherwise. The `docs/` folder is the
ai-sdk.dev documentation for this version. Its pages map to
`https://ai-sdk.dev/docs/<section>/<page>`, for example
`docs/07-reference/02-ai-sdk-ui/31-convert-to-model-messages.mdx` →
<https://ai-sdk.dev/docs/reference/ai-sdk-ui/convert-to-model-messages>. I did not fetch the
web copies: what I checked is the installed text.

## Answer in short

- **Carrier: a custom data part on the user message**, for example
  `{ type: "data-attached-items", data: { items: [...] } }` (or one `data-attached-item` per
  item). Data parts are message content. They are stored in `parts`, validated by
  `safeValidateUIMessages({ dataSchemas })`, rendered from `message.parts`, and turned into
  model input by `convertDataPart`.
- **Not metadata.** `convertToModelMessages` never reads `metadata`, so metadata never reaches
  the model. It suits facts *about* the message (timestamps, model id, the `attachments` names
  it holds today), not content the model must read.
- **The model sees only what `convertDataPart` returns.** By default data parts are dropped.
  `createAgentUIStreamResponse` accepts `convertDataPart` and passes it to
  `convertToModelMessages`, so the existing `runAgent` can use it without calling the converter
  itself. It returns a `TextPart` (or `FilePart`) per data part, so "one line per item, marked
  as data" is plain text that we write.
- **`convertDataPart` is synchronous and sees only the part**, not the message or its role.
  Record titles or bodies for the prompt must be read *before* the stream starts (in `runAgent`)
  and looked up inside the callback.
- **Tools per call:** `prepareCall` may return `tools`, `activeTools` and `toolsContext`.
  But `createAgentUIStream` validates, converts and streams against `agent.tools`, the
  constructor set. The safe shape is the one `toolsFor` already uses: a fixed registry, with
  `activeTools` picking the connections' tools and `toolsContext` naming the allowed connections.

## 1. Where attached items can live on a `UIMessage`

`UIMessage<METADATA, DATA_PARTS, TOOLS>` has `id`, `role`, `metadata?` and `parts`
(`src/ui/ui-messages.ts`, the `UIMessage` interface). A data part is typed as:

```ts
// src/ui/ui-messages.ts:262
export type DataUIPart<DATA_TYPES extends UIDataTypes> = ValueOf<{
  [NAME in keyof DATA_TYPES & string]: {
    type: `data-${NAME}`;
    id?: string;
    data: DATA_TYPES[NAME];
  };
}>;
```

`UIDataTypes` is `Record<string, unknown>` (`src/ui/ui-messages.ts:18`). The workspace types its
messages as `UIMessage<WorkspaceMessageMetadata, UIDataTypes, WorkspaceUITools>`
(`src/modules/agent/contracts.ts`), so data parts are allowed but untyped today. Typing them
means replacing `UIDataTypes` with, for example, `{ "attached-items": AttachedItemsData }`.

| Option | Stored | Validated | Shown in chat | Reaches the model |
| --- | --- | --- | --- | --- |
| `data-*` part | in `parts`, in order | `dataSchemas` | yes, as a part in `message.parts` | only through `convertDataPart` |
| `metadata` field | in `metadata` | `metadataSchema` (all messages) | only if the UI reads it | never (§4) |
| request `body` (today's `scope`) | not on the message | `chatTurnDtoSchema` | no | only through our own prompt code |
| `text` part with a convention | in `parts` | no structure | as text | yes, as typed |
| `file` part | in `parts` | URL and media type | as a file | yes, as a file (provider must accept the type) |

The docs separate the first two: "Message metadata differs from data parts in that it's
attached at the message level rather than being part of the message content. … data parts are
ideal for dynamic content that forms part of the message, metadata is perfect for information
about the message itself" (`docs/04-ai-sdk-ui/25-message-metadata.mdx`, "Overview"). The
`convertToModelMessages` reference shows the attached-item case with a user message carrying a
data part next to its text: "This is useful when users need to include additional context
(URLs, code files, JSON configs) with their messages"
(`docs/07-reference/02-ai-sdk-ui/31-convert-to-model-messages.mdx`, "Custom Data Part
Conversion").

The request `body` is how the thread's `scope` reaches the server today (`ChatOptions.scope`,
`src/modules/agent/contracts.ts`). It is not stored with the message, which is why the retry in
`useThreadChat` must send `scope: thread.scope` again
(`src/modules/threads/components/use-thread-chat.ts`, `retry`). A data part removes that.

## 2. Sending: `useChat`'s `sendMessage` and `prepareSendMessagesRequest`

`sendMessage` takes one of three shapes (`src/ui/chat.ts`, `sendMessage`):

- `{ text, files?, metadata?, messageId? }`, where `parts` is typed `never`;
- `{ files, metadata?, messageId? }`;
- a `CreateUIMessage` (`{ parts, metadata?, id?, role? }`), where `text` and `files` are `never`.

The `text` shape builds the parts itself (`[...fileParts, { type: "text", text }]`) and cannot
add a data part. **A message with attached items must use the `parts` shape**:

```ts
sendMessage(
  {
    parts: [
      { type: "text", text: question.text },
      { type: "data-attached-items", data: { items } },
    ],
    metadata: { createdAt, modelId, skillId },
  },
  { body: options },
);
```

In both shapes the chat stores `metadata: message.metadata` on the pushed message (`chat.ts`,
`this.state.pushMessage({ ...uiMessage, id, role, metadata: message.metadata })`), so today's
metadata keeps working.

Nothing on the client validates an outgoing message. `ChatInit.dataPartSchemas` and
`messageMetadataSchema` (`src/ui/chat.ts:202-204`, reachable from `useChat`'s options in
`@ai-sdk/react`, `dist/index.d.ts:112`, `UseChatOptions = … ChatInit<UI_MESSAGE>`) are passed
only to `processUIMessageStream` (`chat.ts:1128-1129`), which checks chunks streamed *from* the
server (`src/ui/process-ui-message-stream.ts:474`, `:1058`).

`prepareSendMessagesRequest` gets `{ api, id, messages, body, headers, … }`
(`src/ui/http-chat-transport.ts:171-176`). The workspace sends `messages.at(-1)`
(`use-thread-chat.ts`), the whole `UIMessage` with its parts and metadata, so a data part
travels with no change to the transport. The server's `chatTurnDtoSchema` parses `message` as
`z.looseObject({ id, role: "user" })` (`src/modules/threads/contracts.ts`), so it passes `parts`
through to `runAgent`, which validates it.

**Regenerate and fork keep the items.** `regenerate()` trims the chat to the last user message
and sends again (`chat.ts`, `regenerate`). That message still holds its data part, and
`withLatestMessage` puts it back in its old place (`src/modules/threads/conversation.ts`). A
fork copies stored messages, parts included (`forkPoint`, same file). *(This touches the map's
"Forks and retries with attached items" item; it is behaviour I read, not a decision.)*

## 3. Validating on the server: `safeValidateUIMessages`

The options are `{ messages, metadataSchema?, dataSchemas?, tools?,
experimental_refineToolInput? }` (`src/ui/validate-ui-messages.ts:391-419`). Example with both
schemas: `docs/07-reference/01-ai-sdk-core/33-safe-validate-ui-messages.mdx`, "Advanced Usage".
The persistence guide asks for it: "When processing messages on the server that contain tool
calls, custom metadata, or data parts, you should validate them using `validateUIMessages`
before sending them to the model" (`docs/04-ai-sdk-ui/03-chatbot-message-persistence.mdx`,
"Validating messages on the server").

What the source does (`src/ui/validate-ui-messages.ts`, `safeValidateUIMessagesInternal`):

1. The base schema accepts any part `{ type: startsWith("data-"), id?: string, data: unknown }`
   on any role (`:147-151`).
2. **`metadataSchema` is applied to every message's `metadata`**, user and assistant alike, and
   the parsed value replaces it. A strict schema must accept the server-stamped
   `startedAt`/`completedAt`/`modelId` on replies too.
3. **With `dataSchemas`, every `data-*` part in the whole conversation must have a schema.**
   One without a schema fails: `No data schema found for data part ${dataName}`. The parsed
   value replaces `data`, so Zod strips unknown keys.
4. Without `dataSchemas`, data parts pass unchecked (`data: unknown`).

Consequences for the workspace:

- `runAgent` validates the *stored conversation plus the new message* on every send
  (`src/modules/agent/run.ts`, `safeValidateUIMessages({ messages, tools })`). A data part's
  name and schema become permanent, as tool names are ("a tool is never renamed", ARCHITECTURE
  "Answers come from the Vercel AI Gateway"). A later schema must still accept old rows.
- `createAgentUIStream` validates a second time, with tools only and no `dataSchemas`
  (`src/agent/create-agent-ui-stream.ts`, `validateUIMessagesForAgent({ messages, tools })`).
  So the data-part check must stay in `runAgent`'s own call. Passing `dataSchemas` there is the
  only change needed.
- The schema checks shape only. Whether the user may read the referenced record (whether the
  connection is theirs, whether the record exists) is a server lookup after validation, as
  `resolveContext` does for ids today (`src/modules/agent/context.ts`).

## 4. Into model input: `convertToModelMessages` and `convertDataPart`

Signature (`src/ui/convert-to-model-messages.ts`):

```ts
convertToModelMessages<UI_MESSAGE>(messages, options?: {
  tools?: ToolSet;
  ignoreIncompleteToolCalls?: boolean;
  convertDataPart?: (part: DataUIPart<InferUIMessageData<UI_MESSAGE>>) => TextPart | FilePart | undefined;
}): Promise<ModelMessage[]>
```

- **User messages:** text parts → `TextPart`, file parts → `FilePart`, and each data part →
  `options?.convertDataPart?.(part)`. `undefined` results are filtered out (`case 'user'`). With
  no callback, data parts are dropped: "By default, data parts in user messages are filtered out
  during conversion" (`31-convert-to-model-messages.mdx`).
- **Assistant messages:** data parts go through the same callback and are pushed when it
  returns a value (`convert-to-model-messages.ts:337-344`).
- **`metadata` is never read** by the converter (no reference to it in the file), so metadata
  cannot reach the model through this path.
- The callback gets **only the part**, not the message, its role or its index, and it is
  **synchronous** (the return type is not a promise). Two consequences:
  - one data-part type converts the same in questions and in replies. Use distinct types if a
    reply's links (for example records a reply cites) should read differently;
  - text built from server data (titles, states) must be read beforehand. Close over a map
    filled in `runAgent`, or rewrite the validated part's `data` on the server before streaming.

**Using it with the agent.** The workspace calls `createAgentUIStreamResponse` and never calls
`convertToModelMessages` itself. Both `createAgentUIStream` and `createAgentUIStreamResponse`
take `convertDataPart` and pass it on: "Converts custom UI data parts to text or file model
message parts. Data parts are ignored when omitted or when the callback returns undefined"
(`src/agent/create-agent-ui-stream.ts:99-105`, used at `:137-140`;
`src/agent/create-agent-ui-stream-response.ts:26`, `:69-71`). So `runAgent` gains one option:

```ts
createAgentUIStreamResponse({
  agent: workspaceAgent,
  uiMessages: validated.data,
  convertDataPart: (part) =>
    part.type === "data-attached-items"
      ? { type: "text", text: attachedItemsBlock(part.data, resolved) }
      : undefined,
  // …
});
```

**Controlling what the model sees.** The callback's `TextPart` is the whole model view of the
part, so "one line per item, marked as data" is a text convention we choose, for example:

```text
<attached_items>
github issue laserjm/workspace-prototype#39 "Carrying attached items…" (open)
github pull_request laserjm/workspace-prototype#35 "Drop the @conventions/nextjs package…" (merged)
</attached_items>
```

With one data part per message, the callback writes the whole block. With one part per item,
each part becomes its own `TextPart` (one line each), but nothing can wrap the group, since the
callback sees one part at a time.

*Unconfirmed:* a `TextPart` carries `providerOptions` but no "this is data, not instruction"
flag. I found no SDK-level marker, so the marking is only the text and the instructions that
explain it. Returning a `FilePart` (for example `text/markdown` with a record's body) is allowed
by the type. Whether every gateway model accepts that media type in a user message I did not
check.

## 5. Persistence as `UIMessage` rows

Nothing changes in storage. `createAgentUIStream` streams with
`originalMessages = uiMessageStreamOptions.originalMessages ?? validatedMessages`
(`create-agent-ui-stream.ts:154-155`), and `runAgent` passes the validated conversation as
`originalMessages`. `onEnd` therefore gets the user message with its data part as validated,
and `saveConversation` writes `message.parts` into `thread_messages.parts` (`jsonb`) and
`message.metadata` into `metadata` (`src/modules/threads/rows.ts`, `toMessageRows`;
`src/lib/db/schema.ts`, `threadMessagesTable`). On reload, `toMessage` reads them back as they
are, and the next send validates them against `dataSchemas` again (§3).

Two places read `metadata.attachments` today and would read the data part instead:
`conversationCounts` (`src/modules/threads/conversation.ts`) for the sidebar counts, and the
attachment chips. The chat UI renders by `part.type` in
`src/modules/threads/components/message-parts.tsx`, so a `data-attached-items` case there is
where record chips go.

**A thread's attached items** ("every item attached so far, across connections", map #36) are
the data parts of the stored user messages: a `flatMap` over the validated conversation in
`runAgent`, with no column. The map's settled migration drops `scope`/`record_ids`, and nothing
replaces them.

## 6. `ToolLoopAgent.prepareCall`: `tools` and `activeTools` per call

**What it may return.** The return type is a `Pick` of the agent settings that includes
`model`, `tools`, `toolChoice`, `instructions`, `stopWhen`, `activeTools`, `toolOrder`,
`toolApproval`, `prepareStep`, `providerOptions` and others
(`src/agent/tool-loop-agent-settings.ts:369-470`). Its input adds
`{ toolsContext: InferToolSetContext<TOOLS> }`. It may be async (`MaybePromiseLike`).
`ToolLoopAgent.prepareCall` first validates `options` against `callOptionsSchema`, then calls
the setting, and whatever it returns *replaces* the call settings
(`src/agent/tool-loop-agent.ts:94-190`). Hence the documented
`({ options, ...settings }) => ({ ...settings, … })` pattern ("The returned object replaces the
call settings, so spread the incoming settings and override only the ones you want to change",
`docs/03-agents/05-configuring-call-options.mdx`, "Modifying Agent Settings").

The docs show both per-call levers:

- **`tools`**, replacing a tool with one configured from options ("Dynamic Tool Configuration":
  `web_search` rebuilt with the user's location). `tools` is typed `TOOLS`, the same key set as
  the constructor's.
- **`activeTools`**, a subset by name ("Combining Multiple Modifications":
  `activeTools: options.userRole === 'admin' ? ['readDatabase', 'writeDatabase'] : ['readDatabase']`).
  `filterActiveTools({ tools, activeTools })` is the helper behind this
  (`docs/07-reference/01-ai-sdk-core/29-filter-active-tools.mdx`).

**The catch for the chat path.** `createAgentUIStream` uses `agent.tools`, the constructor's
tools (`tool-loop-agent.ts:90-92`), not the per-call ones, in three places:
validating incoming messages, `convertToModelMessages({ tools: agent.tools })`, and
`toUIMessageStream({ tools: agent.tools })` (`create-agent-ui-stream.ts:125-165`).
`toUIMessageChunk` uses that set to decide whether a tool part is `dynamic`
(`src/ui-message-stream/to-ui-message-chunk.ts:54-63`). A tool name that exists only in a
per-call `tools` set is therefore unknown to validation on the next send. A finished part of it
is turned into a `dynamic-tool` part (`validate-ui-messages.ts`, `asDynamicToolPart` for
"terminal" states). An unfinished one fails `No tool schema found for tool part …`. *(Read from
source, not tested.)*

**What fits the map.** "The server decides which connections are allowed, never the model"
(map #36). The existing shape already does this and keeps every tool name in the registry:

1. In `runAgent`, collect the attached items from the validated conversation's user messages
   and resolve their connections against the user's own (as `resolveContext` does for skills
   and sources).
2. Put the allowed connection ids into `AgentContext`, which reaches `prepareCall` as
   `options.context` (`callOptionsSchema: z.object({ context: z.custom<AgentContext>() })`,
   `src/modules/agent/run.ts`).
3. `toolsFor(context)` returns `activeTools` (a provider's tools only when one of its
   connections is allowed) and `toolsContext` (the allowed connection ids per tool), so each
   tool's `execute` refuses a connection outside the list ("Context, not trust", ARCHITECTURE
   "Agent tools live in their module").

`prepareCall` cannot see the UI parts. It gets `prompt`/`messages` as `ModelMessage`s after
conversion (`tool-loop-agent.ts:94-99`), where the data parts are already text or gone. That is
why the allowed set is computed in `runAgent` from the UI messages and passed in through
`options`. Per step, `prepareStep` (also returnable from `prepareCall`) can narrow
`activeTools` further. Nothing here needs it.

## Sources

All paths are relative to `node_modules/ai/` (`ai` 7.0.162) unless they start with `src/modules`
or `src/lib` (this repo).

- `src/ui/ui-messages.ts`: `UIMessage`, `DataUIPart`, `UIDataTypes`
- `src/ui/chat.ts`: `ChatInit` (`dataPartSchemas`, `messageMetadataSchema`), `sendMessage`,
  `regenerate`
- `src/ui/http-chat-transport.ts`: `prepareSendMessagesRequest`
- `src/ui/process-ui-message-stream.ts`: client-side schema checks on streamed chunks
- `src/ui/validate-ui-messages.ts`: `safeValidateUIMessages`, `validateUIMessagesForAgent`
- `src/ui/convert-to-model-messages.ts`: `convertToModelMessages`, `convertDataPart`
- `src/agent/create-agent-ui-stream.ts`, `src/agent/create-agent-ui-stream-response.ts`: the
  `convertDataPart` pass-through, and use of `agent.tools`
- `src/agent/tool-loop-agent.ts`, `src/agent/tool-loop-agent-settings.ts`: `prepareCall`
- `src/ui-message-stream/to-ui-message-chunk.ts`: the `dynamic` flag from `tools`
- `docs/04-ai-sdk-ui/25-message-metadata.mdx`: metadata vs data parts
- `docs/04-ai-sdk-ui/03-chatbot-message-persistence.mdx`: validating stored messages
- `docs/07-reference/01-ai-sdk-core/33-safe-validate-ui-messages.mdx`
- `docs/07-reference/02-ai-sdk-ui/31-convert-to-model-messages.mdx`: "Custom Data Part
  Conversion"
- `docs/03-agents/05-configuring-call-options.mdx`: `prepareCall`, dynamic `tools`,
  `activeTools`
- `docs/07-reference/01-ai-sdk-core/29-filter-active-tools.mdx`
- `node_modules/@ai-sdk/react/dist/index.d.ts` (4.0.166): `UseChatOptions` = `ChatInit` & …
- This repo: `src/modules/agent/run.ts`, `context.ts`, `tools.ts`, `contracts.ts`;
  `src/modules/threads/answer.ts`, `contracts.ts`, `conversation.ts`, `rows.ts`,
  `components/use-thread-chat.ts`; `src/lib/db/schema.ts`; `ARCHITECTURE.md`

The Next.js docs (`node_modules/next/dist/docs/`) were not needed: nothing here depends on the
route or server-action layer, which keeps the shape it has today.
