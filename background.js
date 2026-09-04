import { fetchPRs, diff, blockedCount } from "./github.js";

const POLL_MINUTES = 5;

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error(err));

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("poll", { periodInMinutes: POLL_MINUTES });
  poll();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("poll", { periodInMinutes: POLL_MINUTES });
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
});

async function paintBadge() {
  const { unseen = [], blocked = 0, token } = await chrome.storage.local.get([
    "unseen",
    "blocked",
    "token",
  ]);

  if (!token) {
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
  const { token, snapshot = {}, unseen = [] } = await chrome.storage.local.get([
    "token",
    "snapshot",
    "unseen",
  ]);
  if (!token) return { ok: false };

  try {
    const data = await fetchPRs(token);
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
