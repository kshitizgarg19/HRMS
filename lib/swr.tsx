"use client";

import useSWR, { SWRConfig, preload, type SWRConfiguration } from "swr";
import { api } from "./api";
import { todayStr } from "./format";

/** Shared fetcher — every cached GET goes through the same auth-aware client. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetcher = (key: string): Promise<any> => api(key);

const CACHE_PREFIX = "nexus-swr-cache";
// Bump this whenever an API response SHAPE changes. Old-shaped caches live under a different
// bucket name and get purged on load, so a stale cache can never crash a newer page again.
const CACHE_VERSION = "v2";
const CACHE_KEY = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const bucketKey = (userId: number | string) => `${CACHE_KEY}:${userId}`;

/** Remove every NexusHR cache bucket (any version/user) EXCEPT the one named (or all, when keep is undefined). */
function purgeBuckets(keep?: string) {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX) && k !== keep) sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/**
 * sessionStorage-backed cache provider, **scoped to the signed-in user**. Each user
 * reads/writes only their own bucket (`nexus-swr-cache:<userId>`), and any other user's
 * bucket on this device is purged on load — so one account's data can NEVER leak into
 * another's view when they share a browser. Restores the snapshot so revisited pages
 * paint instantly, then revalidate in the background.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeProvider(userId: number | string): Map<string, any> {
  if (typeof window === "undefined") return new Map();
  const KEY = bucketKey(userId);
  purgeBuckets(KEY); // drop any previous/other user's cached data on this device
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let map: Map<string, any>;
  try {
    map = new Map(JSON.parse(sessionStorage.getItem(KEY) || "[]"));
  } catch {
    map = new Map();
  }
  const save = () => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(Array.from(map.entries())));
    } catch {
      /* quota / serialization — non-fatal */
    }
  };
  window.addEventListener("beforeunload", save);
  // Persist on tab-hide too (mobile / app-switch), so a snapshot always survives.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") save(); });
  return map;
}

/** Wipe ALL cache buckets — call on logout so the next user starts completely clean. */
export function clearDataCache() {
  purgeBuckets();
}

const GLOBAL: SWRConfiguration = {
  fetcher,
  keepPreviousData: true,     // show the last data while the next loads → no loader flash on tab switch
  revalidateOnFocus: true,    // silently refresh when the user returns to the tab
  revalidateIfStale: true,
  refreshInterval: 5000,      // LIVE: re-fetch every 5s so changes appear without a manual refresh
  refreshWhenHidden: false,   // …but pause polling while the tab is in the background (saves requests)
  dedupingInterval: 3000,     // collapse duplicate requests fired within 3s
  focusThrottleInterval: 5000,
  errorRetryCount: 2,
};

export function SWRProvider({ userId, children }: { userId: number | string; children: React.ReactNode }) {
  return <SWRConfig value={{ ...GLOBAL, provider: () => makeProvider(userId) }}>{children}</SWRConfig>;
}

/**
 * Drop-in data hook. Returns cached data synchronously when available (instant),
 * revalidates in the background, and exposes `reload()` for post-mutation refresh.
 */
export function useData<T>(key: string | null, opts?: SWRConfiguration) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<T>(key, fetcher, opts);
  return { data, error, isLoading, isValidating, reload: () => mutate() };
}

/** Warm a key's cache ahead of navigation (used on nav hover). */
export function prefetch(key?: string) {
  if (key) preload(key, fetcher);
}

/** Nav href → the data key its page loads first. Hovering a tab warms it so the click is instant. */
export const ROUTE_PREFETCH: Record<string, string> = {
  "/dashboard": "/api/dashboard",
  "/profile": "/api/profile",
  "/attendance": `/api/attendance?month=${todayStr().slice(0, 7)}`,
  "/timesheet": "/api/timesheets",
  "/leave": "/api/leaves",
  "/duty": "/api/duty",
  "/reimbursement": "/api/reimbursements",
  "/tasks": "/api/tasks",
  "/payroll": "/api/payroll?mine=1",
  "/directory": "/api/employees",
  "/holidays": "/api/holidays",
  "/announcements": "/api/announcements",
  "/admin/approvals": "/api/leaves?all=1&status=Pending",
  "/admin/employees": "/api/employees",
  "/admin/settings": "/api/settings",
};
