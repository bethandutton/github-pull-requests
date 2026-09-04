import { fetchPRs, diff, blockedCount } from "./github.js";
import { getAccount, reconcile, getPollMinutes } from "./store.js";

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error(err));

async function schedule() {
  chrome.alarms.create("poll", { periodInMinutes: await getPollMinutes() });
}

chrome.runtime.onInstalled.addListener(() => {
  schedule();
  poll();
});

chrome.runtime.onStartup.addListener(() => {
  schedule();
  poll();
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "poll") poll();
});

// The panel tells us when it has been looked at, or when it has fetched
// fresher data than the last poll.
chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg?.type === "seen") {
    chrome.storage.local.set({ unseen: [] }).then(() => {
      paintBadge();
      respond({ ok: true });
    });
    return true;
  }
  if (msg?.type === "poll") {
    poll().then((r) => respond(r));
    return true;
  }
  if (msg?.type === "reschedule") {
    schedule().then(() => respond({ ok: true }));
    return true;
  }
  if (msg?.type === "oauthPost") {
    oauthPost(msg).then(respond);
    return true;
  }
});

// The panel keeps the timing of the device flow; this just makes the call, so
// that a closed panel cannot leave a half-finished sign-in behind.
async function oauthPost({ url, params }) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(params).toString(),
    });
    if (!res.ok) return { error: `GitHub returned ${res.status}.` };
    return { json: await res.json() };
  } catch (e) {
    return {
      error:
        "Could not reach github.com. Check the extension has access to github.com " +
        "in chrome://extensions, then reload it.",
    };
  }
}

async function paintBadge() {
  const { unseen = [], blocked = 0 } = await chrome.storage.local.get(["unseen", "blocked"]);
  const account = await getAccount();

  if (!account) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }

  if (unseen.length) {
    // Something moved since you last looked.
    chrome.action.setBadgeText({ text: "\u25CF" });
    chrome.action.setBadgeBackgroundColor({ color: "#1a7f37" });
    chrome.action.setTitle({
      title:
        unseen.length === 1
          ? "GitHub Pull Requests: 1 pull request changed"
          : `GitHub Pull Requests: ${unseen.length} pull requests changed`,
    });
    return;
  }

  chrome.action.setBadgeText({ text: blocked > 0 ? String(blocked) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#b3261e" });
  chrome.action.setTitle({
    title: blocked > 0 ? `GitHub Pull Requests: ${blocked} waiting on you` : "GitHub Pull Requests",
  });
}

async function poll() {
  const account = await getAccount();
  if (!account) return { ok: false };

  const { snapshot = {}, unseen = [] } = await chrome.storage.local.get(["snapshot", "unseen"]);

  try {
    const data = await fetchPRs(account.token);
    await reconcile(data.viewer);
    const { snapshot: next, changed } = diff(data, snapshot);
    const merged = [...new Set([...unseen, ...changed])].filter((id) => id in next);

    await chrome.storage.local.set({
      snapshot: next,
      unseen: merged,
      blocked: blockedCount(data),
      cache: { data, at: Date.now() },
    });
    await paintBadge();
    return { ok: true, changed: merged };
  } catch (e) {
    console.warn("GitHub Pull Requests poll failed:", e.message);
    return { ok: false, error: e.message };
  }
}
