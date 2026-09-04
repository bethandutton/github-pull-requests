# Privacy policy

**GitHub Pull Requests** (the extension) does not collect, transmit, or store any personal data on any server. There is no server.

## What is stored

| Data | Where | Why |
| --- | --- | --- |
| Your GitHub personal access token | `chrome.storage.local`, on your device | To authenticate requests to the GitHub API |
| A cached copy of your pull request list | `chrome.storage.local`, on your device | So the panel is not blank while it refreshes |
| A signature per pull request | `chrome.storage.local`, on your device | To work out what changed since you last looked |

All of it is local to your browser profile. Removing the extension removes it. You can also clear it at any time with **Remove token** in the extension's settings.

## What is transmitted

One HTTPS request to `https://api.github.com/graphql`, carrying your token in the `Authorization` header, asking for your open pull requests and those awaiting your review. No other host is contacted. Avatar images are loaded from GitHub's own image hosts.

## What is not done

No analytics. No telemetry. No advertising. No third-party scripts. Nothing is sold, shared, or transferred to anyone. No remotely hosted code is executed.

## Permissions

| Permission | Reason |
| --- | --- |
| `sidePanel` | The extension's entire interface is the browser side panel |
| `storage` | To keep your token and cache on your device |
| `alarms` | To schedule the periodic refresh |
| `https://api.github.com/` | The only endpoint contacted |

## Contact

Open an issue on the repository.
