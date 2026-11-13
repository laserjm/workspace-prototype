// Recorded GitHub answers for tests that reach the GitHub provider (ADR 0003 §5). Call it inside a
// test, naming each request the test expects and its answer:
//
//   useRecordedGithub({
//     "GET /user/repos?per_page=100": "repositories.json",
//     "GET /search/issues?q=repo:a/b&per_page=20": { status: 401, body: { message: "Bad credentials" } },
//   });
//
// A string is a file in providers/github/fixtures/; an object is an answer written inline; an
// Error is a request that never got an answer. The query is compared parameter by parameter, in
// any order. A request that is not listed fails the test and names it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { onTestFinished, vi } from "vitest";

const FIXTURES = path.resolve(
  import.meta.dirname,
  "../../modules/integrations/providers/github/fixtures",
);
const BASE_URL = "https://api.github.com";

export type RecordedAnswer =
  | string
  | { status: number; headers?: Record<string, string>; body?: unknown }
  | Error;

/** "GET /search/issues?page=2&q=…": the method, the path and the query sorted by name, decoded. */
function requestKey(method: string, url: URL) {
  const params = [...url.searchParams].toSorted(([a], [b]) => a.localeCompare(b));
  const query = params.map(([name, value]) => `${name}=${value}`).join("&");
  return `${method} ${url.pathname}${query ? `?${query}` : ""}`;
}

function answerOf(answer: Exclude<RecordedAnswer, Error>): Response {
  if (typeof answer === "string")
    return new Response(readFileSync(path.join(FIXTURES, answer), "utf8"), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
    status: answer.status,
    headers: { "content-type": "application/json", ...answer.headers },
  });
}

/** Stubs `fetch` with the listed answers for this test; returns the requests made, by key. */
export function useRecordedGithub(answers: Record<string, RecordedAnswer>) {
  const listed = new Map(
    Object.entries(answers).map(([key, answer]) => {
      const space = key.indexOf(" ");
      const method = key.slice(0, space);
      return [requestKey(method, new URL(key.slice(space + 1), BASE_URL)), answer];
    }),
  );
  const requests: string[] = [];
  const unlisted: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const key = requestKey(init?.method ?? "GET", url);
      requests.push(key);
      const answer = url.origin === BASE_URL ? listed.get(key) : undefined;
      if (answer === undefined) {
        unlisted.push(key);
        throw new Error(`No recorded answer for ${url.origin} ${key}`);
      }
      if (answer instanceof Error) throw answer;
      return answerOf(answer);
    }),
  );
  onTestFinished(() => {
    vi.unstubAllGlobals();
    if (unlisted.length)
      throw new Error(`Requests without a recorded answer:\n${unlisted.join("\n")}`);
  });
  return { requests };
}
