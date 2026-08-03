import { useEffect, useState } from "react";
import { documentsClient } from "@dynatrace-sdk/client-document";

/**
 * Resolves dashboard UUIDs to their human names.
 *
 * The Query Cost tab attributes spend to a dashboard id parsed out of
 * `client.source` — accurate, but a UUID tells nobody which dashboard to go
 * fix. The Document API knows the names, so one list call turns the table from
 * "f3e5279e-c18f…" into "Kubernetes Overview".
 *
 * Fetched ONCE per session at module level (like useRateCard): every mount
 * shares the same promise, so switching tabs never re-requests. Names change
 * rarely, and a stale name is a cosmetic miss — never a wrong number.
 *
 * Failure is non-fatal by design: on error the map stays empty and the table
 * falls back to showing ids, exactly as before.
 */

let namesPromise: Promise<Map<string, string>> | null = null;

/** Lists every dashboard the caller can see, following pagination. */
async function listAll(adminAccess: boolean): Promise<Map<string, string>> {
  const byId = new Map<string, string>();
  let pageKey: string | undefined;
  do {
    const res = await documentsClient.listDocuments({
      filter: 'type == "dashboard"',
      pageSize: 500,
      ...(adminAccess ? { adminAccess: true } : {}),
      ...(pageKey ? { pageKey } : {}),
    });
    for (const d of res.documents ?? []) {
      if (d.id && d.name) byId.set(d.id, d.name);
    }
    pageKey = res.nextPageKey;
  } while (pageKey);
  return byId;
}

function loadDashboardNamesOnce(): Promise<Map<string, string>> {
  if (namesPromise) return namesPromise;
  namesPromise = (async () => {
    // Without adminAccess the API returns only documents shared with the
    // CALLER — and the priciest dashboards usually belong to someone else, so
    // exactly the rows that matter would stay unresolved. Try the wider read
    // first and fall back when the environment denies it.
    try {
      return await listAll(true);
    } catch {
      // Not permitted (or unsupported) — fall through to the personal scope.
    }
    try {
      return await listAll(false);
    } catch {
      // Missing document:documents:read, or the API is unavailable — the tab
      // degrades to ids rather than breaking.
      return new Map<string, string>();
    }
  })();
  return namesPromise;
}

export interface DashboardNames {
  /** dashboard id → display name. Empty until resolved (or on failure). */
  byId: Map<string, string>;
  isLoading: boolean;
}

export function useDashboardNames(): DashboardNames {
  const [byId, setById] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadDashboardNamesOnce()
      .then((m) => { if (!cancelled) setById(m); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { byId, isLoading };
}
