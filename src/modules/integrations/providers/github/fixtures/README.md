# Recorded GitHub answers

Plain GitHub REST answers for the GitHub provider's tests (ADR 0003 §5): one response body per
file, no headers, no token. They come from the public sandbox
[laserjm/workspace-fixtures](https://github.com/laserjm/workspace-fixtures), whose records are
made by its `seed/seed.sh` ([laserjm/workspace-fixtures#10](https://github.com/laserjm/workspace-fixtures/pull/10))
and labelled `fixture` plus one `case/<name>`:

| Record | Label | Case | Files |
| --- | --- | --- | --- |
| [#6](https://github.com/laserjm/workspace-fixtures/issues/6) | `case/open-issue` | open issue, 3 comments | `issue.json`, `issue-comments.json` |
| [#7](https://github.com/laserjm/workspace-fixtures/issues/7) | `case/not-planned` | closed as not planned | `issue-not-planned.json` |
| [#8](https://github.com/laserjm/workspace-fixtures/pull/8) | `case/merged-pr` | merged; a review, an inline comment, 4 files; on its head two Actions runs and two commit statuses (one failing) | `pull-request*.json` |
| [#9](https://github.com/laserjm/workspace-fixtures/pull/9) | `case/draft-pr` | open draft | `pull-request-draft.json` |

`fixtures.test.ts` beside this folder checks that each file has its line below, finds each case by
its label (not its number) and checks its state.

## Capture again

From this folder, signed into `gh` as the sandbox's owner. Each line writes one file; the test
fails when a line and a file don't match.

```bash
get() { gh api -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' "$@"; }
head=$(get repos/laserjm/workspace-fixtures/pulls/8 --jq .head.sha)
get user --jq 'del(.email, .notification_email, .private_gists, .total_private_repos, .owned_private_repos, .disk_usage, .collaborators, .two_factor_authentication, .plan)' > user.json
get 'user/repos?visibility=public&affiliation=owner&per_page=100' --jq '[.[] | select(.full_name == "laserjm/workspace-fixtures")]' > repositories.json
get -X GET search/issues -f q='repo:laserjm/workspace-fixtures' -f sort=updated -f order=desc -F per_page=20 > search.json
get -X GET search/issues -f q='repo:laserjm/workspace-fixtures involves:@me' -f sort=updated -f order=desc -F per_page=20 > search-involves-me.json
get -X GET search/issues -f q='repo:laserjm/workspace-fixtures is:issue is:open status in:title,body' -f sort=updated -f order=desc -F per_page=20 > search-narrowed.json
get repos/laserjm/workspace-fixtures/issues/6 > issue.json
get 'repos/laserjm/workspace-fixtures/issues/6/comments?per_page=100' > issue-comments.json
get repos/laserjm/workspace-fixtures/issues/7 > issue-not-planned.json
get repos/laserjm/workspace-fixtures/pulls/8 > pull-request.json
get 'repos/laserjm/workspace-fixtures/issues/8/comments?per_page=100' > pull-request-comments.json
get 'repos/laserjm/workspace-fixtures/pulls/8/reviews?per_page=100' > pull-request-reviews.json
get 'repos/laserjm/workspace-fixtures/pulls/8/comments?per_page=100' > pull-request-review-comments.json
get 'repos/laserjm/workspace-fixtures/pulls/8/files?per_page=100' > pull-request-files.json
get repos/laserjm/workspace-fixtures/commits/$head/status > pull-request-status.json
get "repos/laserjm/workspace-fixtures/actions/runs?head_sha=$head" > pull-request-workflow-runs.json
get repos/laserjm/workspace-fixtures/pulls/9 > pull-request-draft.json
```

The three searches are the ones #43 describes, with "Include closed" on: the two that run
before typing (`involves:@me`, then the same scope without it) and one narrowed by a repository
word (`workspace-fixtures status` becomes `repo:… status in:title,body`) with the issue toggle and
"Include closed" off. The JSON is formatted with `python3 -m json.tool --no-ensure-ascii`.

Two answers are cut down before they are saved, so that nothing private reaches this public
repository:

- `user.json` drops the account-only fields (email, quotas, private counts, plan, 2FA).
- `repositories.json` keeps only the sandbox from the owner's public repositories: the answer a
  fine-grained token limited to that one repository gets.

Search answers list every record in the sandbox, including ones that are not `fixture` cases, and
GitHub's search index can lag a few minutes behind a fresh seed. Tests assert the seeded titles,
states, counts and paths, never ids, timestamps or the order of search results.
