# GitHub Pull Requests

A Chrome side panel that lists your open pull requests as cards, best news first, and puts a dot on the toolbar icon when something moves.

No build step, no dependencies, no backend. Five files and a token.

## Install

Until it's on the Chrome Web Store:

1. Clone or download this repo.
2. Go to `chrome://extensions` and turn on Developer mode.
3. Press **Load unpacked** and select the folder.
4. Pin the icon to your toolbar and click it.
5. Press **Open settings** and paste a GitHub token. The panel tells you where to find it.

### Getting a token

On github.com: profile photo (top right) → **Settings** → **Developer settings** at the bottom of the left sidebar → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)** → tick **repo** → **Generate token**.

Copy it straight away, GitHub only shows it once. Or use the shortcut link in the panel's settings, which opens that page with `repo` already ticked.

## What it does

- Click the toolbar icon to open the panel
- Click a card to open that pull request in a new tab
- A green dot on the icon means something changed since you last looked
- A red number means that many things are blocked on you

### Ordering

Approved and ready to merge, approved with checks running, waiting on review, changes requested, checks failing, merge conflicts, draft. Below a divider: anything awaiting your review.

### On each card

Status pill, age, title, repo and number, head into base branch, up to three labels in their GitHub colours, author, comment count, files changed, additions and deletions, and a four-segment track showing where it sits in the flow (draft → in review → checks → mergeable).

## How it works

| File | Job |
| --- | --- |
| `manifest.json` | MV3. `sidePanel`, `storage`, `alarms`, and one host permission for `api.github.com` |
| `github.js` | The GraphQL query and all the status logic, shared by both contexts |
| `background.js` | Service worker. Polls every 5 minutes, diffs against the last snapshot, paints the badge |
| `sidepanel.html/css/js` | The panel itself |

One GraphQL request per refresh covering both searches, which keeps you far inside the 5,000 points per hour limit even polling all day.

The "something changed" dot compares a signature per PR: bucket, approval count, change-request count, pending reviewers, and CI rollup. It deliberately ignores `updatedAt`, because a new comment on a busy repo is not a state change and a dot that fires all day is a dot you stop looking at.

## Privacy

Your token is stored in `chrome.storage.local` and never leaves your browser except in the `Authorization` header to `api.github.com`. There is no server, no analytics, and no telemetry. See [PRIVACY.md](PRIVACY.md).

## Configuration

Scope to a single org by editing the search strings in `QUERY` in `github.js`:

```js
mine: search(query: "is:open is:pr author:@me org:yourorg archived:false", ...)
```

Poll interval is `POLL_MINUTES` in `background.js`.

## Known limits

- Classic tokens with `repo` scope are all-or-nothing. OAuth device flow or a GitHub App would be a better fit for a public release, and is the main thing standing between this and a store listing.
- The icon is currently GitHub's own mark. GitHub's logo guidelines don't permit their mark as a third-party app icon, so it needs replacing before any store submission.
- Same goes for the name: GitHub's trademark policy asks that "GitHub" not lead a third-party product name. Fine for a repo, worth a rethink before publishing.
- Nothing is cached beyond the last successful response, so a cold start with no network shows an error rather than stale data.

## Licence

MIT. See [LICENSE](LICENSE).
