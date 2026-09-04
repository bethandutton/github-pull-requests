import { BUCKETS, STAGES, BLOCKED_BUCKETS, classify, stage, statusLine, fetchPRs } from "./github.js";

const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo&description=PR%20Rail";

const els = {
  content: document.getElementById("content"),
  connect: document.getElementById("connect"),
  setup: document.getElementById("setup"),
  token: document.getElementById("token"),
  tokenLink: document.getElementById("token-link"),
  save: document.getElementById("save"),
  forget: document.getElementById("forget"),
  closeSetup: document.getElementById("close-setup"),
  goSettings: document.getElementById("go-settings"),
  err: document.getElementById("err"),
  refresh: document.getElementById("refresh"),
  settings: document.getElementById("settings"),
  stamp: document.getElementById("stamp"),
};

let moved = new Set(); // ids that changed since the panel was last opened

/* Helpers */

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function age(iso) {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.round(days / 7)}w`;
}

const openTab = (url) => chrome.tabs.create({ url, active: true });

/* Card */

function cardHTML(pr) {
  const bucket = classify(pr);
  const b = BUCKETS.find((x) => x.id === bucket);
  const blocked = BLOCKED_BUCKETS.includes(bucket);
  const at = stage(pr);

  const track = STAGES.map((name, i) => {
    let state = "todo";
    if (i < at) state = "done";
    else if (i === at) state = blocked ? "stuck" : "now";
    return `<span class="seg ${state}" title="${name}"></span>`;
  }).join("");

  const labels = (pr.labels?.nodes ?? [])
    .map((l) => `<span class="label" style="--chip:#${esc(l.color)}">${esc(l.name)}</span>`)
    .join("");

  const author = pr.author
    ? `<span class="who"><img src="${esc(pr.author.avatarUrl)}" alt="" /><span>${esc(pr.author.login)}</span></span>`
    : "";

  const talk = pr.comments.totalCount
    ? `<span class="talk">${pr.comments.totalCount} comment${pr.comments.totalCount === 1 ? "" : "s"}</span>`
    : "";

  return `
    <button class="pr" data-url="${esc(pr.url)}" style="--tone: var(--${b.tone})">
      <span class="pr-top">
        <span class="pill"><span class="bead"></span>${esc(statusLine(pr))}</span>
        ${moved.has(pr.id) ? '<span class="moved" title="Changed since you last looked"></span>' : ""}
        <span class="age">${age(pr.updatedAt)}</span>
      </span>
      <span class="title">${esc(pr.title)}</span>
      <span class="repo">${esc(pr.repository.nameWithOwner)} #${pr.number}</span>
      <span class="branch">${esc(pr.headRefName)} into ${esc(pr.baseRefName)}</span>
      ${labels ? `<span class="labels">${labels}</span>` : ""}
      <span class="facts">
        ${author}
        ${talk}
        <span class="files">${pr.changedFiles} file${pr.changedFiles === 1 ? "" : "s"}</span>
        <span class="diff"><span class="add">+${pr.additions}</span> <span class="del">-${pr.deletions}</span></span>
      </span>
      <span class="track">${track}</span>
    </button>`;
}

function groupsHTML(prs) {
  const byBucket = new Map(BUCKETS.map((b) => [b.id, []]));
  for (const pr of prs) byBucket.get(classify(pr)).push(pr);

  return BUCKETS.filter((b) => byBucket.get(b.id).length)
    .map((b) => {
      const list = byBucket
        .get(b.id)
        .sort((a, z) => new Date(z.updatedAt) - new Date(a.updatedAt))
        .map(cardHTML)
        .join("");
      return `<section class="group">
        <h2>${b.label}<span class="count">${byBucket.get(b.id).length}</span></h2>
        ${list}
      </section>`;
    })
    .join("");
}

function render({ mine, toReview }) {
  if (!mine.length && !toReview.length) {
    els.content.innerHTML = `<p class="empty">No open pull requests. Enjoy it.</p>`;
    return;
  }

  let html = groupsHTML(mine);

  if (toReview.length) {
    html += `<div class="divider"></div>
      <section class="group">
        <h2>Waiting on your review<span class="count">${toReview.length}</span></h2>
        ${toReview
          .sort((a, z) => new Date(z.updatedAt) - new Date(a.updatedAt))
          .map(cardHTML)
          .join("")}
      </section>`;
  }

  els.content.innerHTML = html;

  for (const card of els.content.querySelectorAll(".pr")) {
    card.addEventListener("click", () => openTab(card.dataset.url));
  }
}

/* Screens */

function show(which) {
  els.content.hidden = which !== "list";
  els.connect.hidden = which !== "connect";
  els.setup.hidden = which !== "settings";
  els.refresh.hidden = which !== "list";
}

async function openSettings() {
  const { token } = await chrome.storage.local.get("token");
  els.forget.hidden = !token;
  els.closeSetup.hidden = !token;
  show("settings");
  els.token.focus();
}

/* Load */

async function load({ silent } = {}) {
  const { token, cache } = await chrome.storage.local.get(["token", "cache"]);
  if (!token) return show("connect");

  show("list");

  // Paint from cache first so the panel is never blank.
  if (cache?.data && !silent) render(cache.data);

  els.refresh.classList.add("spin");
  try {
    const data = await fetchPRs(token);
    await chrome.storage.local.set({ cache: { data, at: Date.now() } });
    render(data);
    els.stamp.textContent = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    els.content.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  } finally {
    els.refresh.classList.remove("spin");
  }
}

/* Wiring */

els.tokenLink.href = TOKEN_URL;
els.tokenLink.addEventListener("click", (e) => {
  e.preventDefault();
  openTab(TOKEN_URL);
});

els.goSettings.addEventListener("click", openSettings);
els.settings.addEventListener("click", openSettings);
els.closeSetup.addEventListener("click", () => load());
els.refresh.addEventListener("click", () => load({ silent: true }));

els.save.addEventListener("click", async () => {
  const token = els.token.value.trim();
  if (!token) return;
  els.save.disabled = true;
  try {
    await fetchPRs(token);
  } catch (e) {
    els.err.textContent = e.message;
    els.err.hidden = false;
    els.save.disabled = false;
    return;
  }
  await chrome.storage.local.set({ token });
  await chrome.runtime.sendMessage({ type: "poll" });
  els.token.value = "";
  els.err.hidden = true;
  els.save.disabled = false;
  load();
});

els.token.addEventListener("keydown", (e) => {
  if (e.key === "Enter") els.save.click();
});

els.forget.addEventListener("click", async () => {
  await chrome.storage.local.remove(["token", "cache", "snapshot", "unseen", "blocked"]);
  await chrome.runtime.sendMessage({ type: "seen" });
  show("connect");
});

// Opening the panel counts as looking: grab what changed, then clear the dot.
(async () => {
  const { unseen = [] } = await chrome.storage.local.get("unseen");
  moved = new Set(unseen);
  chrome.runtime.sendMessage({ type: "seen" });
  load();
})();

setInterval(() => load({ silent: true }), 3 * 60 * 1000);
