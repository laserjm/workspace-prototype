const GITHUB_REFERENCE =
  /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(pull|issues)\/(\d+)(?:[/?#].*)?$/;
const GITLAB_MERGE_REQUEST =
  /^https:\/\/gitlab\.com\/((?:[\w.-]+\/)*)([\w.-]+)\/-\/merge_requests\/(\d+)(?:[/?#].*)?$/;
// A scheme, a protocol-relative URL, a fragment or a query: not a path into a codebase.
const NOT_A_PATH = /^(?:[a-z][a-z\d+.-]*:|\/\/|[#?])/i;
const FILE_NAME = /(?:^|\/)[\w@.-]*\.[a-z\d]{1,10}$/i;

export type ChangeReference = {
  kind: "pull-request" | "issue";
  /** How the reference reads as a chip, `owner/repo#123`. */
  label: string;
};

/** A GitHub pull request or issue, or a GitLab merge request, that a link points at. */
export function changeReferenceOf(href: string | undefined): ChangeReference | null {
  if (!href) return null;
  const github = GITHUB_REFERENCE.exec(href);
  if (github) {
    const [, owner, repo, kind, number] = github;
    return {
      kind: kind === "pull" ? "pull-request" : "issue",
      label: `${owner}/${repo}#${number}`,
    };
  }
  const gitlab = GITLAB_MERGE_REQUEST.exec(href);
  if (gitlab) {
    const [, , repo, number] = gitlab;
    return { kind: "pull-request", label: `${repo}!${number}` };
  }
  return null;
}

/**
 * The file a link points at: a `file:` URL or a relative path with a file name. The workspace
 * cannot open either, so these show as chips rather than links that would resolve against the
 * app's own URL.
 */
export function filePathOf(href: string | undefined): string | null {
  if (!href) return null;
  if (href.startsWith("file:")) {
    try {
      return decodeURIComponent(new URL(href).pathname) || null;
    } catch {
      return null;
    }
  }
  if (NOT_A_PATH.test(href)) return null;
  const path = href.replace(/[#?].*$/, "");
  return FILE_NAME.test(path) ? path : null;
}

/** The last segment of a path, for a chip's label. */
export function fileNameOf(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}
