// GitHub device flow. There is no client secret in this flow, which is exactly
// why it suits an extension: nothing here needs hiding.

// From the OAuth app at github.com/settings/developers, with Device Flow enabled.
export const CLIENT_ID = "";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
const SCOPE = "repo";

const MESSAGES = {
  access_denied: "That was turned down on GitHub. Start again if you meant to approve it.",
  expired_token: "The code ran out. Start again to get a fresh one.",
  device_flow_disabled: "Device flow is switched off for this extension's GitHub app.",
  incorrect_client_credentials: "This extension's GitHub app is not set up correctly.",
  unsupported_grant_type: "This extension's GitHub app is not set up correctly.",
};

const describe = (code) => MESSAGES[code] ?? `GitHub said: ${code}.`;

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("Cancelled."));
      },
      { once: true }
    );
  });
}

async function post(url, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) throw new Error(`GitHub returned ${res.status}.`);
  return res.json();
}

export function isConfigured() {
  return CLIENT_ID.length > 0;
}

// Step one: ask GitHub for a code to show the user.
export async function requestCode() {
  const json = await post(DEVICE_CODE_URL, { client_id: CLIENT_ID, scope: SCOPE });
  if (json.error) throw new Error(describe(json.error));
  return json;
}

// Step two: keep asking until it is approved, refused, or runs out of time.
export async function waitForToken({ device_code, interval, expires_in }, { signal } = {}) {
  let wait = (interval ?? 5) * 1000;
  const deadline = Date.now() + (expires_in ?? 900) * 1000;

  while (Date.now() < deadline) {
    await sleep(wait, signal);

    const json = await post(TOKEN_URL, {
      client_id: CLIENT_ID,
      device_code,
      grant_type: GRANT_TYPE,
    });

    if (json.access_token) return json.access_token;
    if (json.error === "authorization_pending") continue;
    if (json.error === "slow_down") {
      wait += 5000;
      continue;
    }
    throw new Error(describe(json.error));
  }

  throw new Error(describe("expired_token"));
}
