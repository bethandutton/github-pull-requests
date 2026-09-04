# Privacy policy

**GitHub Pull Requests** (the extension) does not collect, transmit, or store any personal data on any server. There is no server.

## What is stored

| Data | Where | Why |
| --- | --- | --- |
| The GitHub access token you granted when you approved the extension, with the login and avatar it belongs to | `chrome.storage.local`, on your device | To authenticate requests to the GitHub API and to show which account is connected |
| A cached copy of your pull request list | `chrome.storage.local`, on your device | So the panel is not blank while it refreshes |
| A signature per pull request | `chrome.storage.local`, on your device | To work out what changed since you last looked |
| Your chosen refresh interval | `chrome.storage.local`, on your device | To know how often to check |

All of it is local to your browser profile. Removing the extension removes it. You can also clear it at any time with **Remove** next to your account in the extension's settings. To withdraw the extension's access at GitHub's end as well, use **Authorised OAuth Apps** in your GitHub settings.

## What is transmitted

While you are signing in, requests go to `https://github.com/login/device/code` and `https://github.com/login/oauth/access_token`, carrying only the extension's public Client ID and the code for this sign-in. After that, one HTTPS request per refresh to `https://api.github.com/graphql`, carrying your token in the `Authorization` header, asking for your open pull requests and those awaiting your review. No other host is contacted. Avatar images are loaded from GitHub's own image hosts.

## What is not done

No analytics. No telemetry. No advertising. No third-party scripts. Nothing is sold, shared, or transferred to anyone. No remotely hosted code is executed.

## Permissions

| Permission | Reason |
| --- | --- |
| `sidePanel` | The extension's entire interface is the browser side panel |
| `storage` | To keep your token, settings, and cache on your device |
| `clipboardWrite` | To copy a branch name when you click a card's title |
| `alarms` | To schedule the periodic refresh |
| `https://api.github.com/` | The only endpoint contacted |
| `https://github.com/*` | Two things: signing in, which posts to GitHub's device flow endpoints to get a code and then a token; and spotting a pull request you already have open in a tab, so clicking a card focuses that tab instead of opening a second one. No github.com page is read or altered |

## Contact

Open an issue on the repository.
