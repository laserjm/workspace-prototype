GitHub records are issues and pull requests. A key is `owner/repository#number`, for example
`acme/web#482`; issues and pull requests share the numbers of their repository.

States:
- An issue is `open`, `closed` (closed as completed) or `not_planned` (closed as not planned).
- A pull request is `open`, `draft` (open, not ready for review), `merged` or `closed` (closed
  without being merged).

`search_records` uses GitHub's issue search syntax. Plain words match titles, descriptions and
comments; put a phrase in double quotes. Qualifiers narrow it: `label:"bug"`, `author:login`,
`assignee:login`, `involves:@me`, `review-requested:@me`, `no:assignee`, `is:merged`,
`draft:true`, `-label:wontfix`, and dates such as `created:>2026-01-01` or
`updated:2026-10-01..2026-10-31`. Ask for a type with `type` (`issue` or `pull-request`).
Only open records are found unless `includeClosed` is set or the query names a state
(`is:closed`, `is:merged`). A number (`482`) finds that number when one repository is in play.

A search only ever covers the repositories the connection's token can read. A repository's
name (`web` or `acme/web`), `repo:acme/web`, `user:acme` or `org:acme` narrows it to those of
them; one the token cannot read is ignored. `AND`, `OR`, `NOT` and parentheses are searched as
words, so ask one search per alternative.
