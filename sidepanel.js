import { BUCKETS, STAGES, BLOCKED_BUCKETS, classify, stage, statusLine, fetchPRs } from "./github.js";
import { getAccount, saveAccount, dropAccount, reconcile, getPollMinutes, setPollMinutes } from "./store.js";

const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo&description=PR%20Rail";

const els = {
  content: document.getElementById("content"),
  connect: document.getElementById("connect"),
  setup: document.getElementById("setup"),
  token: document.getElementById("token"),
  tokenLink: document.getElementById("token-link"),
  save: document.getElementById("save"),
  accounts: document.getElementById("accounts"),
  addAccount: document.getElementById("add-account"),
  swapNote: document.getElementById("swap-note"),
  help: document.getElementById("help"),
  rate: document.getElementById("rate"),
  closeSetup: document.getElementById("close-setup"),
  goSettings: document.getElementById("go-settings"),
  err: document.getElementById("err"),
  refresh: document.getElementById("refresh"),
  settings: document.getElementById("settings"),
  filter: document.getElementById("filter"),
  filters: document.getElementById("filters"),
  filterBody: document.getElementById("filter-body"),
  clearFilters: document.getElementById("clear-filters"),
  fcount: document.getElementById("fcount"),
  stamp: document.getElementById("stamp"),
};

let moved = new Set(); // ids that changed since the panel was last opened
let latest = { mine: [], toReview: [] }; // everything fetched, before filtering
let timer = null;

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

// Land on the tab you already have open rather than stacking up duplicates.
async function openTab(url) {
  const [open] = await chrome.tabs.query({ url });
  if (open) {
    await chrome.tabs.update(open.id, { active: true });
    await chrome.windows.update(open.windowId, { focused: true });
    chrome.tabs.reload(open.id);
    return;
  }
  chrome.tabs.create({ url, active: true });
}

// Says what happened in the line that would otherwise show the branch.
function flash(card, message) {
  const line = card.querySelector(".branch");
  if (!line) return;
  if (!line.dataset.original) line.dataset.original = line.textContent;
  clearTimeout(Number(line.dataset.timer));
  line.textContent = message;
  line.classList.add("flashed");
  line.dataset.timer = String(
    setTimeout(() => {
      line.textContent = line.dataset.original;
      line.classList.remove("flashed");
    }, 1400)
  );
}

/* Filtering */

// Each option cycles: off, show only, hide. Filters live for as long as the
// panel is open and are deliberately not stored: a filter you cannot see the
// reason for is just an empty list.
const picked = {
  buckets: { include: new Set(), exclude: new Set() },
  labels: { include: new Set(), exclude: new Set() },
  repos: { include: new Set(), exclude: new Set() },
};

const KINDS = ["buckets", "labels", "repos"];

const filterCount = () =>
  KINDS.reduce((n, k) => n + picked[k].include.size + picked[k].exclude.size, 0);

function passes(kind, values) {
  const { include, exclude } = picked[kind];
  if (values.some((v) => exclude.has(v))) return false;
  if (include.size && !values.some((v) => include.has(v))) return false;
  return true;
}

function keep(pr) {
  return (
    passes("buckets", [classify(pr)]) &&
    passes("repos", [pr.repository.nameWithOwner]) &&
    passes("labels", (pr.labels?.nodes ?? []).map((l) => l.name))
  );
}

function stateOf(kind, value) {
  if (picked[kind].include.has(value)) return "in";
  if (picked[kind].exclude.has(value)) return "out";
  return "off";
}

const SAID = { in: "showing only", out: "hidden", off: "not filtered" };

function optionHTML(kind, value, label, count, chip) {
  const state = stateOf(kind, value);
  return `<button type="button" class="opt ${state}"
    data-kind="${kind}" data-value="${esc(value)}" data-label="${esc(label)}"
    aria-label="${esc(label)}, ${SAID[state]}">
    <span class="box" aria-hidden="true"></span>
    <span class="dot" style="--chip:${esc(chip)}"></span>
    <span class="opt-label">${esc(label)}</span>
    <span class="opt-count">${count}</span>
  </button>`;
}

function tally(items) {
  const seen = new Map();
  for (const [key, meta] of items) {
    const hit = seen.get(key) ?? { ...meta, count: 0 };
    hit.count += 1;
    seen.set(key, hit);
  }
  return seen;
}

// Options come from everything fetched, not the filtered view, so choosing one
// does not make the others disappear underneath you.
function buildFilters() {
  const all = [...latest.mine, ...latest.toReview];

  const buckets = tally(all.map((pr) => [classify(pr), {}]));
  const repos = tally(all.map((pr) => [pr.repository.nameWithOwner, {}]));
  const labels = tally(
    all.flatMap((pr) => (pr.labels?.nodes ?? []).map((l) => [l.name, { color: l.color }]))
  );

  const statusOpts = BUCKETS.filter((b) => buckets.has(b.id))
    .map((b) => optionHTML("buckets", b.id, b.label, buckets.get(b.id).count, `var(--${b.tone})`))
    .join("");

  const byCount = (a, z) => z[1].count - a[1].count || a[0].localeCompare(z[0]);

  const repoOpts = [...repos.entries()]
    .sort(byCount)
    .map(([name, { count }]) => optionHTML("repos", name, name, count, "var(--idle)"))
    .join("");

  const labelOpts = [...labels.entries()]
    .sort(byCount)
    .map(([name, { color, count }]) => optionHTML("labels", name, name, count, `#${color}`))
    .join("");

  els.filterBody.innerHTML =
    statusOpts || repoOpts || labelOpts
      ? `<p class="hint">Click to show only. Click again to hide.</p>
         ${statusOpts ? `<h3>Status</h3><div class="opts">${statusOpts}</div>` : ""}
         ${repoOpts ? `<h3>Repositories</h3><div class="opts">${repoOpts}</div>` : ""}
         ${labelOpts ? `<h3>Tags</h3><div class="opts">${labelOpts}</div>` : ""}`
      : `<p class="note">Nothing to filter yet.</p>`;

  for (const btn of els.filterBody.querySelectorAll(".opt")) {
    btn.addEventListener("click", () => {
      const { include, exclude } = picked[btn.dataset.kind];
      const value = btn.dataset.value;

      if (include.has(value)) {
        include.delete(value);
        exclude.add(value);
      } else if (exclude.has(value)) {
        exclude.delete(value);
      } else {
        include.add(value);
      }

      const state = stateOf(btn.dataset.kind, value);
      btn.className = `opt ${state}`;
      btn.setAttribute("aria-label", `${btn.dataset.label}, ${SAID[state]}`);

      els.clearFilters.hidden = !filterCount();
      paintFilterButton();
      render(latest);
    });
  }
}

function paintFilterButton() {
  const n = filterCount();
  els.fcount.hidden = !n;
  els.fcount.textContent = n;
  els.filter.classList.toggle("on", n > 0);
}

function clearFilters() {
  for (const kind of KINDS) {
    picked[kind].include.clear();
    picked[kind].exclude.clear();
  }
  els.clearFilters.hidden = true;
  paintFilterButton();
}

function toggleFilters(open) {
  const next = open ?? els.filters.hidden;
  els.filters.hidden = !next;
  els.filter.setAttribute("aria-expanded", String(next));
  if (next) {
    buildFilters();
    els.clearFilters.hidden = !filterCount();
  }
}

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
    <div class="pr" role="link" tabindex="0" data-url="${esc(pr.url)}"
      aria-label="${esc(pr.title)}, ${esc(pr.repository.nameWithOwner)} number ${pr.number}"
      style="--tone: var(--${b.tone})">
      <span class="pr-top">
        <span class="pill"><span class="bead"></span>${esc(statusLine(pr))}</span>
        ${moved.has(pr.id) ? '<span class="moved" title="Changed since you last looked"></span>' : ""}
        <span class="age">${age(pr.updatedAt)}</span>
      </span>
      <button type="button" class="title" data-branch="${esc(pr.headRefName)}"
        aria-label="Copy branch name ${esc(pr.headRefName)}">${esc(pr.title)}</button>
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
    </div>`;
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

const ALL_CLEAR = `
  <div class="blank">
    <svg class="blank-mark" viewBox="0 0 24 24" width="38" height="38" aria-hidden="true">
      <path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
        stroke-linejoin="round" d="M3.5 12.8 9 18.3 20.5 6.2"/>
    </svg>
    <h2>All clear</h2>
    <p>Nothing open, and nothing waiting on your review. Everything is tidied away.</p>
  </div>`;

const NO_MATCHES = `
  <div class="blank">
    <svg class="blank-mark muted" viewBox="0 0 16 16" width="34" height="34" aria-hidden="true">
      <path fill="currentColor" d="M1.8 2.4h12.4a.6.6 0 0 1 .46.99L10 9.1v4.03a.6.6 0 0 1-.33.54l-2.4 1.2a.6.6 0 0 1-.87-.54V9.1L1.34 3.39a.6.6 0 0 1 .46-.99Z"/>
    </svg>
    <h2>Nothing matches</h2>
    <p>No pull requests match the filters you have set.</p>
    <button type="button" class="ghost" id="blank-clear">Clear filters</button>
  </div>`;

function render(data) {
  latest = data;

  const mine = data.mine.filter(keep);
  const toReview = data.toReview.filter(keep);

  if (!mine.length && !toReview.length) {
    els.content.innerHTML = filterCount() ? NO_MATCHES : ALL_CLEAR;
    document.getElementById("blank-clear")?.addEventListener("click", () => {
      clearFilters();
      if (!els.filters.hidden) buildFilters();
      render(latest);
    });
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
    card.addEventListener("click", (e) => {
      if (e.target.closest(".title")) return;
      openTab(card.dataset.url);
    });
    card.addEventListener("keydown", (e) => {
      if (e.target !== card) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      openTab(card.dataset.url);
    });
  }

  for (const btn of els.content.querySelectorAll(".pr .title")) {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const card = btn.closest(".pr");
      try {
        await navigator.clipboard.writeText(btn.dataset.branch);
        flash(card, "Branch name copied");
      } catch {
        flash(card, "Could not copy the branch name");
      }
    });
  }
}

/* Screens */

function show(which) {
  els.content.hidden = which !== "list";
  els.connect.hidden = which !== "connect";
  els.setup.hidden = which !== "settings";
  els.refresh.hidden = which !== "list";
  els.filter.hidden = which !== "list";
  if (which !== "list") toggleFilters(false);
}

function renderAccount(account) {
  els.accounts.hidden = !account;
  els.swapNote.hidden = !account;
  els.addAccount.hidden = Boolean(account);
  els.help.open = !account;

  if (!account) {
    els.accounts.innerHTML = "";
    return;
  }

  els.accounts.innerHTML = `<li class="account">
    ${account.avatarUrl ? `<img src="${esc(account.avatarUrl)}" alt="" />` : ""}
    <span class="login">${esc(account.login)}</span>
    <button type="button" class="drop" aria-label="Remove ${esc(account.login)}">Remove</button>
  </li>`;

  els.accounts.querySelector(".drop").addEventListener("click", async () => {
    await dropAccount();
    await chrome.runtime.sendMessage({ type: "seen" });
    clearFilters();
    show("connect");
  });
}

async function openSettings() {
  const account = await getAccount();
  renderAccount(account);
  els.closeSetup.hidden = !account;
  els.rate.value = String(await getPollMinutes());
  els.err.hidden = true;
  show("settings");
  if (!account) els.token.focus();
}

/* Load */

async function startTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => load({ silent: true }), (await getPollMinutes()) * 60 * 1000);
}

async function load({ silent } = {}) {
  const account = await getAccount();
  if (!account) return show("connect");

  show("list");

  // Paint from cache first so the panel is never blank.
  if (!silent) {
    const { cache } = await chrome.storage.local.get("cache");
    if (cache?.data) render(cache.data);
  }

  els.refresh.classList.add("spin");
  try {
    const data = await fetchPRs(account.token);
    await reconcile(data.viewer);
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

els.filter.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleFilters();
});

els.clearFilters.addEventListener("click", () => {
  clearFilters();
  buildFilters();
  render(latest);
});

document.addEventListener("click", (e) => {
  if (els.filters.hidden) return;
  if (els.filters.contains(e.target) || els.filter.contains(e.target)) return;
  toggleFilters(false);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.filters.hidden) {
    toggleFilters(false);
    els.filter.focus();
  }
});

els.rate.addEventListener("change", async () => {
  await setPollMinutes(Number(els.rate.value));
  await chrome.runtime.sendMessage({ type: "reschedule" });
  startTimer();
});

els.save.addEventListener("click", async () => {
  const token = els.token.value.trim();
  if (!token) return;
  els.save.disabled = true;

  let viewer;
  try {
    ({ viewer } = await fetchPRs(token));
  } catch (e) {
    els.err.textContent = e.message;
    els.err.hidden = false;
    els.save.disabled = false;
    return;
  }

  await saveAccount({ login: viewer.login, avatarUrl: viewer.avatarUrl, token });
  await chrome.runtime.sendMessage({ type: "poll" });
  els.token.value = "";
  els.err.hidden = true;
  els.save.disabled = false;
  load();
});

els.token.addEventListener("keydown", (e) => {
  if (e.key === "Enter") els.save.click();
});

// Opening the panel counts as looking: grab what changed, then clear the dot.
(async () => {
  const { unseen = [] } = await chrome.storage.local.get("unseen");
  moved = new Set(unseen);
  chrome.runtime.sendMessage({ type: "seen" });
  await load();
  startTimer();
})();
