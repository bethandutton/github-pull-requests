// Everything kept in chrome.storage. Shared between the side panel and the service worker.

// 1.2 and earlier kept a bare token under `token`, with no account details.
// The login and avatar get filled in by the first successful fetch.
async function migrate(token) {
  const account = { login: "Connected account", avatarUrl: "", token, method: "token" };
  await chrome.storage.local.set({ account });
  await chrome.storage.local.remove("token");
  return account;
}

export async function getAccount() {
  const { account, token } = await chrome.storage.local.get(["account", "token"]);
  if (account) return account;
  if (token) return migrate(token);
  return null;
}

export async function saveAccount({ login, avatarUrl, token, method = "oauth" }) {
  const account = { login, avatarUrl, token, method };
  await chrome.storage.local.set({ account });
  return account;
}

export async function dropAccount() {
  await chrome.storage.local.remove(["account", "token", "cache", "snapshot", "unseen", "blocked"]);
}

// Keeps the login and avatar current, and names the account migrated from 1.2.
export async function reconcile(viewer) {
  const account = await getAccount();
  if (!account) return null;
  if (account.login === viewer.login && account.avatarUrl === viewer.avatarUrl) return account;
  return saveAccount({ ...account, login: viewer.login, avatarUrl: viewer.avatarUrl });
}

/* How often to check GitHub */

export const DEFAULT_POLL_MINUTES = 5;

export async function getPollMinutes() {
  const { pollMinutes } = await chrome.storage.local.get("pollMinutes");
  return pollMinutes ?? DEFAULT_POLL_MINUTES;
}

export async function setPollMinutes(minutes) {
  await chrome.storage.local.set({ pollMinutes: minutes });
}

/* Filters

   Session storage, not local: filters survive closing and reopening the panel,
   and are gone when Chrome itself is. Nothing about them reaches the disk. */

export async function getFilters() {
  const { filters } = await chrome.storage.session.get("filters");
  return filters ?? null;
}

export async function setFilters(filters) {
  await chrome.storage.session.set({ filters });
}
