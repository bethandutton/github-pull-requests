// Shared between the side panel and the service worker.

const PR_FIELDS = `
  ... on PullRequest {
    id
    number
    title
    url
    isDraft
    createdAt
    updatedAt
    mergeable
    reviewDecision
    additions
    deletions
    changedFiles
    baseRefName
    headRefName
    repository { nameWithOwner }
    author { login avatarUrl(size: 48) }
    comments { totalCount }
    labels(first: 3) { nodes { name color } }
    approvals: reviews(states: APPROVED) { totalCount }
    changeRequests: reviews(states: CHANGES_REQUESTED) { totalCount }
    reviewRequests { totalCount }
    commits(last: 1) {
      nodes { commit { statusCheckRollup { state } } }
    }
  }
`;

export const QUERY = `
query {
  viewer { login avatarUrl(size: 48) }
  mine: search(query: "is:open is:pr author:@me archived:false", type: ISSUE, first: 40) {
    nodes { ${PR_FIELDS} }
  }
  toReview: search(query: "is:open is:pr review-requested:@me archived:false", type: ISSUE, first: 40) {
    nodes { ${PR_FIELDS} }
  }
}`;

// The normal life of a pull request.
export const STAGES = ["Draft", "In review", "Checks", "Mergeable"];

// Best news first: approved and mergeable at the top, unfinished work at the bottom.
export const BUCKETS = [
  { id: "ready", label: "Approved and ready to merge", tone: "ready" },
  { id: "approved", label: "Approved, checks running", tone: "ready" },
  { id: "waiting", label: "Waiting on review", tone: "waiting" },
  { id: "changes", label: "Changes requested", tone: "blocked" },
  { id: "failing", label: "Checks failing", tone: "blocked" },
  { id: "conflict", label: "Merge conflicts", tone: "blocked" },
  { id: "draft", label: "Draft", tone: "idle" },
];

export const BLOCKED_BUCKETS = ["changes", "failing", "conflict"];

export function checksOf(pr) {
  return pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null;
}

export function classify(pr) {
  const checks = checksOf(pr);
  if (pr.isDraft) return "draft";
  if (pr.reviewDecision === "CHANGES_REQUESTED") return "changes";
  if (checks === "FAILURE" || checks === "ERROR") return "failing";
  if (pr.mergeable === "CONFLICTING") return "conflict";
  if (pr.reviewDecision === "APPROVED") {
    return checks === "PENDING" ? "approved" : "ready";
  }
  return "waiting";
}

export function stage(pr) {
  const checks = checksOf(pr);
  if (pr.isDraft) return 0;
  if (pr.reviewDecision !== "APPROVED") return 1;
  if (checks === "PENDING" || checks === null) return 2;
  if (checks === "FAILURE" || checks === "ERROR") return 2;
  return pr.mergeable === "CONFLICTING" ? 2 : 3;
}

export function statusLine(pr) {
  const checks = checksOf(pr);
  const ok = pr.approvals.totalCount;
  const no = pr.changeRequests.totalCount;
  const pending = pr.reviewRequests.totalCount;

  if (pr.isDraft) return "Draft";
  if (pr.reviewDecision === "CHANGES_REQUESTED") {
    return no === 1 ? "1 change requested" : `${no} changes requested`;
  }
  if (checks === "FAILURE" || checks === "ERROR") return "Checks failing";
  if (pr.mergeable === "CONFLICTING") return "Conflicts with base";
  if (pr.reviewDecision === "APPROVED") {
    if (checks === "PENDING") return `Approved by ${ok}, checks running`;
    return ok === 1 ? "Approved, ready to merge" : `Approved by ${ok}, ready to merge`;
  }
  if (pending > 0) {
    if (ok > 0) return `${ok} approved, ${pending} still to review`;
    return pending === 1 ? "Waiting on 1 reviewer" : `Waiting on ${pending} reviewers`;
  }
  if (ok > 0) return `Approved by ${ok}`;
  return "No reviewers assigned";
}

// What counts as "something changed". Deliberately excludes updatedAt: a new
// comment on a busy repo is not a state change, and a dot that fires all day
// is a dot you stop looking at.
export function signature(pr) {
  return [
    classify(pr),
    pr.approvals.totalCount,
    pr.changeRequests.totalCount,
    pr.reviewRequests.totalCount,
    checksOf(pr) ?? "none",
  ].join("|");
}

export async function fetchPRs(token) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: QUERY }),
  });

  if (res.status === 401) {
    throw new Error("GitHub rejected that token. It may have expired or be missing the repo scope.");
  }
  if (!res.ok) throw new Error(`GitHub returned ${res.status}.`);

  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return {
    viewer: json.data.viewer,
    mine: json.data.mine.nodes.filter(Boolean),
    toReview: json.data.toReview.nodes.filter(Boolean),
  };
}

export function diff(data, previous) {
  const next = {};
  const changed = [];
  const firstRun = !Object.keys(previous).length;
  for (const pr of [...data.mine, ...data.toReview]) {
    const sig = signature(pr);
    next[pr.id] = sig;
    if (!(pr.id in previous)) {
      if (!firstRun) changed.push(pr.id);
    } else if (previous[pr.id] !== sig) {
      changed.push(pr.id);
    }
  }
  return { snapshot: next, changed };
}

export function blockedCount(data) {
  return (
    data.toReview.length +
    data.mine.filter((pr) => BLOCKED_BUCKETS.includes(classify(pr))).length
  );
}
