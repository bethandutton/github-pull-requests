# GitHub Pull Requests

A Chrome side panel that lists your open pull requests as cards, best news first, and puts a dot on the toolbar icon when something moves.

No build step, no dependencies, no backend. Six files and a token.

## Install

Until it's on the Chrome Web Store:

1. Clone or download this repo.
2. Go to `chrome://extensions` and turn on Developer mode.
3. Press **Load unpacked** and select the folder.
4. Pin the icon to your toolbar and click it.
5. Press **Open settings** and paste a GitHub token. The panel tells you where to find it.

### Getting a token

On github.com: profile photo (top right) → **Settings** → **Developer settings** at the bottom of the left sidebar → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)** → tick **repo** → **Generate token**.

**What to tick:** just **repo**, which is what lets the panel see pull requests in private repositories. Ticking it ticks everything nested underneath, which is normal. Nothing else is needed, so leave every other box clear. If you only ever work in public repositories, a token with nothing ticked at all is enough.

GitHub bundles read and write into that single **repo** box, so it grants more than this extension uses. The panel only ever reads, and only from `api.github.com`.

Copy it straight away, GitHub only shows it once. Or use the shortcut link in the panel's settings, which opens that page with `repo` already ticked.

## What it does

- Click the toolbar icon to open the panel
- Click a card to open that pull request in a new tab
- A green dot on the icon means something changed since you last looked
- A red number means that many things are blocked on you
- The funnel filters the list by status, repository and tag. Click an option to show only that, click again to hide it
- Click a card's title to copy its branch name
- Clicking a card you already have open focuses that tab and refreshes it rather than opening a duplicate
- The cog holds your account and how often to refresh

### Ordering

Approved and ready to merge, approved with checks running, waiting on review, changes requested, checks failing, merge conflicts, draft. Below a divider: anything awaiting your review.

### On each card

Status pill, age, title (click it to copy the branch name), repo and number, head into base branch, up to three labels in their GitHub colours, author, comment count, files changed, additions and deletions, and a four-segment track showing where it sits in the flow (draft → in review → checks → mergeable).

## How it works

| File | Job |
| --- | --- |
| `manifest.json` | MV3. `sidePanel`, `storage`, `alarms`, and host permissions for `api.github.com` and `github.com` |
| `github.js` | The GraphQL query and all the status logic, shared by both contexts |
| `store.js` | The account and the refresh interval, in `chrome.storage.local` |
| `background.js` | Service worker. Polls every 5 minutes, diffs against the last snapshot, paints the badge |
| `sidepanel.html/css/js` | The panel itself |

One GraphQL request per refresh covering both searches, which keeps you far inside the 5,000 points per hour limit even polling all day.

The "something changed" dot compares a signature per PR: bucket, approval count, change-request count, pending reviewers, and CI rollup. It deliberately ignores `updatedAt`, because a new comment on a busy repo is not a state change and a dot that fires all day is a dot you stop looking at.

## Privacy

Your token is stored in `chrome.storage.local` and never leaves your browser except in the `Authorization` header to `api.github.com`. There is no server, no analytics, and no telemetry. See [PRIVACY.md](PRIVACY.md).

## Configuration

The refresh interval is in the extension's own settings, under the cog.

Scope to a single org by editing the search strings in `QUERY` in `github.js`:

```js
mine: search(query: "is:open is:pr author:@me org:yourorg archived:false", ...)
```

## Known limits

- Classic tokens with `repo` scope are all-or-nothing. OAuth device flow or a GitHub App would be a better fit for a public release, and is the main thing standing between this and a store listing.
- The icon is currently GitHub's own mark. GitHub's logo guidelines don't permit their mark as a third-party app icon, so it needs replacing before any store submission.
- Same goes for the name: GitHub's trademark policy asks that "GitHub" not lead a third-party product name. Fine for a repo, worth a rethink before publishing.
- Nothing is cached beyond the last successful response, so a cold start with no network shows an error rather than stale data.
- Filters reset when the panel closes. A filter you cannot see the reason for is just an empty list.
- Finding an already-open tab needs a `github.com` host permission. Nothing on the page is read or changed, but it is a permission a reviewer will ask about.
- Tags come from the three labels the card already shows, so a fourth label on a busy pull request is not filterable.

## Licence

MIT. See [LICENSE](LICENSE).
