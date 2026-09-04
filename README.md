# GitHub Pull Requests

A Chrome side panel that lists your open pull requests as cards, best news first, and puts a dot on the toolbar icon when something moves.

No build step, no dependencies, no backend. Seven files and a sign-in.

## Install

Until it's on the Chrome Web Store:

1. Clone or download this repo.
2. Create a GitHub OAuth app and put its Client ID in `oauth.js` (see below).
3. Go to `chrome://extensions` and turn on Developer mode.
4. Press **Load unpacked** and select the folder.
5. Pin the icon to your toolbar and click it.
6. Press **Connect GitHub**, approve the code on github.com, and you're in.

If your organisation restricts OAuth apps, or you would rather hold a credential you can expire yourself, **Use an access token instead** on the same screen takes a classic personal access token with the `repo` scope. Use a classic one: GitHub's GraphQL search does not reliably support fine-grained tokens yet, so the list can come back empty.

### Setting up the OAuth app

The extension signs you in with GitHub's device flow, so there is nothing to copy and paste and no client secret to hide. It does need an OAuth app of your own:

1. On github.com: profile photo → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**.
2. Give it any name and homepage URL. The callback URL is not used, so anything valid will do.
3. Tick **Enable Device Flow**. This is the part that matters.
4. Copy the **Client ID** into `CLIENT_ID` in `oauth.js`.

The Client ID is public by design, which is why it can sit in the source. Do not add the client secret; device flow does not use one, and it must never ship in an extension.

The extension asks for the `repo` scope so that private repositories show up. GitHub bundles read and write into that one scope, so it grants more than the panel uses. It only ever reads, and only from `api.github.com`. You can withdraw access at any time under **Authorised OAuth Apps** in your GitHub settings.

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
| `oauth.js` | The device flow: ask for a code, wait for it to be approved |
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

- The `repo` scope is still all-or-nothing: it covers every repository you can reach, and includes write access the panel never uses. A GitHub App with fine-grained permissions would be tighter, at the cost of needing an install on each organisation.
- The icon is currently GitHub's own mark. GitHub's logo guidelines don't permit their mark as a third-party app icon, so it needs replacing before any store submission.
- Same goes for the name: GitHub's trademark policy asks that "GitHub" not lead a third-party product name. Fine for a repo, worth a rethink before publishing.
- Anyone cloning this needs their own OAuth app. There is no shared Client ID in the repo.
- Nothing is cached beyond the last successful response, so a cold start with no network shows an error rather than stale data.
- Filters reset when the panel closes. A filter you cannot see the reason for is just an empty list.
- Finding an already-open tab needs a `github.com` host permission. Nothing on the page is read or changed, but it is a permission a reviewer will ask about.
- Tags come from the three labels the card already shows, so a fourth label on a busy pull request is not filterable.

## Licence

MIT. See [LICENSE](LICENSE).
