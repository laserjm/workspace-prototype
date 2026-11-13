# Recorded GitHub answers

Real REST API responses captured on 2026-11-13 from the public, synthetic
[laserjm/workspace-fixtures](https://github.com/laserjm/workspace-fixtures) sandbox
for [issue 55](https://github.com/laserjm/workspace-prototype/issues/55), following
[the recorded-answer decision](https://github.com/laserjm/workspace-prototype/issues/46).
Each JSON file is one response body, formatted for review. No credentials or
request/response headers are recorded.

| File | Seeded case |
| --- | --- |
| `repositories.json` | One public page of the token's repositories, containing the sandbox |
| `user.json` | Authenticated `laserjm` user, with account-only fields omitted |
| `search.json` | All four seeded records, including closed states |
| `search-involves-me.json` | Open records involving the authenticated user: issue #1 and draft PR #4 |
| `search-narrowed.json` | Repository-scoped open issue search for `launch`: issue #1 |
| `issue.json`, `issue-comments.json` | Open issue #1 with three discussion comments |
| `issue-not-planned.json` | Issue #2, closed with `state_reason: not_planned` |
| `pull-request.json` | Merged PR #3 |
| `pull-request-draft.json` | Open draft PR #4 |
| `pull-request-comments.json` | PR #3's issue-style discussion comment |
| `pull-request-reviews.json` | PR #3's submitted `COMMENTED` review |
| `pull-request-review-comments.json` | Inline review comment on `samples/launch.json` |
| `pull-request-files.json` | Four changed files, including the raw GitHub patch fields |
| `pull-request-status.json` | Successful `fixtures/sample-status` status on PR #3's head |
| `pull-request-workflow-runs.json` | Successful Actions push run on that same head |

The review is synthetic author commentary, not an independent approval. The
commit status is seeded sample data, separate from the workflow that validates
the JSON. The push run is used because a pull-request workflow can run against a
merge commit instead of the PR head. Details in this corpus refer to
`dba3c57ddfe47bde1c174183a4105817ed7ad658` throughout.

## Capture again

Run this Bash block **from this folder**, signed into `gh` as `laserjm`. Use the
provider's REST API version. These nine `gh api` command templates produce all 16
files; the loops keep related endpoints together. They overwrite the saved files.

```bash
repo=laserjm/workspace-fixtures
head=dba3c57ddfe47bde1c174183a4105817ed7ad658
headers=(-H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28')

gh api "${headers[@]}" 'user/repos?visibility=public&affiliation=owner&sort=created&direction=desc&per_page=1&page=1' > repositories.json
gh api "${headers[@]}" user --jq 'del(.email, .notification_email, .private_gists, .total_private_repos, .owned_private_repos, .disk_usage, .collaborators, .two_factor_authentication, .plan)' > user.json

while read -r file query; do
  gh api "${headers[@]}" --method GET search/issues -f "q=$query" -f sort=updated -f order=desc -F per_page=20 -F page=1 > "$file.json"
done <<'SEARCHES'
search repo:laserjm/workspace-fixtures
search-involves-me repo:laserjm/workspace-fixtures is:open involves:@me
search-narrowed repo:laserjm/workspace-fixtures is:issue is:open launch in:title,body
SEARCHES

for pair in '1 issue' '2 issue-not-planned'; do
  read -r number file <<< "$pair"
  gh api "${headers[@]}" "repos/$repo/issues/$number" > "$file.json"
done
for pair in '1 issue-comments' '3 pull-request-comments'; do
  read -r number file <<< "$pair"
  gh api "${headers[@]}" "repos/$repo/issues/$number/comments?per_page=100&page=1" > "$file.json"
done
for pair in '3 pull-request' '4 pull-request-draft'; do
  read -r number file <<< "$pair"
  gh api "${headers[@]}" "repos/$repo/pulls/$number" > "$file.json"
done
for pair in 'reviews reviews' 'comments review-comments' 'files files'; do
  read -r endpoint file <<< "$pair"
  gh api "${headers[@]}" "repos/$repo/pulls/3/$endpoint?per_page=100&page=1" > "pull-request-$file.json"
done
gh api "${headers[@]}" "repos/$repo/commits/$head/status?per_page=100&page=1" > pull-request-status.json
gh api "${headers[@]}" "repos/$repo/actions/runs?head_sha=$head&per_page=100&page=1" > pull-request-workflow-runs.json
```

`repositories.json` deliberately captures only a public, owner-affiliated page,
not the signed-in account's private repositories. At capture time the sandbox was
the newest public repository (page 1 with `per_page=1`). If a newer repository
exists, find the sandbox's page and update the page number above. Preserve the
array response; do not substitute a single `GET /repos/...` object. This page is
not a claim that the token can read only one repository.

`user.json` is the `/user` answer with email, account quotas, private-repository
counts, subscription and authentication settings removed. Other files retain the
API response fields, including nulls and nested public user/repository objects.
Do not use `--include`, `--verbose`, `GH_DEBUG`, or save a token with the fixtures.

After recapturing, check that each file parses as JSON; the searches contain the
seeded states; reviews, comments and files are nonempty; and the workflow run and
status refer to the PR's head SHA. Search indexing can lag after seeding. New
sandbox maintenance PRs may also appear in searches after this initial capture.
Review the diff for private data or credentials before committing. JSON may be
reformatted with `python3 -m json.tool` without changing the response shape.

## Use in tests

These are data for the real GitHub provider, not another provider or a demo
connection. Replay support belongs to the subsequent provider implementation:
replace only `fetch`, refuse unlisted requests, and never fall through to GitHub.
Assert seeded titles, states, counts and file paths, not timestamps or generated
IDs. Keep synthetic error answers inline in tests. No live test, record mode or
CI secret is needed (ADR 0003).
