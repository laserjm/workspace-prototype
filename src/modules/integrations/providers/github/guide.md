GitHub records are issues and pull requests. A key is `owner/repository#number`, for example
`acme/web#482`; issues and pull requests share the numbers of their repository.

States:
- An issue is `open`, `closed` (closed as completed) or `not_planned` (closed as not planned).
- A pull request is `open`, `draft` (open, not ready for review), `merged` or `closed` (closed
  without being merged).

Searching uses GitHub's issue search syntax. Plain words match titles and descriptions.
Qualifiers narrow it: `is:open`, `is:closed`, `is:merged`, `is:draft`, `label:"bug"`,
`author:login`, `assignee:login`, `involves:@me`, `review-requested:@me`, `no:assignee`, and
dates such as `created:>2026-01-01` or `updated:2026-10-01..2026-10-31`. A search only ever
covers the repositories the connection's token can read.
