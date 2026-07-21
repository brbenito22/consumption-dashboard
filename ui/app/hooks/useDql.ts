import { useState, useEffect } from "react";
import { queryExecutionClient } from "@dynatrace-sdk/client-query";

interface DqlResult<T = Record<string, unknown>> {
  data: T[] | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Session-scoped query cache (cost optimization). Identical DQL run by
 * multiple tabs within the TTL window is executed once and reused, avoiding
 * repeated Grail scans. Promises are cached so concurrent identical requests
 * share a single execution.
 */
// 10 min TTL — repeat scans of the heavy `fetch spans / logs / bizevents`
// queries (`topLogSourcesQuery`, `topEndpointsQuery`, offender breakdowns,
// bizevents totals) are the app's dominant Grail cost. A longer session
// cache dramatically cuts repeat scans during typical browsing without
// giving up freshness — billing usage events themselves are also indexed
// dt.system.events data, so re-run within the TTL is a pure cache hit.
const CACHE_TTL_MS = 600_000;
const queryCache = new Map<string, { ts: number; promise: Promise<unknown[]> }>();

function runQuery(query: string): Promise<unknown[]> {
  const cached = queryCache.get(query);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.promise;
  }
  const promise = queryExecutionClient
    .queryExecute({
      body: { query, requestTimeoutMilliseconds: 60_000, fetchTimeoutSeconds: 60 },
    })
    .then((res) => (res.result?.records ?? []) as unknown[])
    .catch((err: Error) => {
      // Don't cache failures — allow a retry on next mount.
      queryCache.delete(query);
      throw err;
    });
  queryCache.set(query, { ts: Date.now(), promise });
  return promise;
}

/**
 * `enabled: false` keeps the query parked — no Grail scan runs until the
 * caller flips it to true (used to gate the billable fetch logs/spans/events
 * top-offender panels behind an explicit click).
 */
export function useDql<T = Record<string, unknown>>(query: string, enabled = true): DqlResult<T> {
  const [data, setData] = useState<T[] | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query || !enabled) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;

    setIsLoading(true);
    setError(null);
    setData(null);

    runQuery(query)
      .then((records) => {
        if (!cancelled) setData(records as T[]);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message ?? "Query failed");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [query, enabled]);

  return { data, isLoading, error };
}

/** Extract a millisecond timestamp from any DQL timestamp shape. */
function resolveTs(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return new Date(raw).getTime();
  if (raw !== null && typeof raw === "object") {
    const tf = raw as Record<string, unknown>;
    const start = tf["start"] ?? tf["startTime"] ?? tf["from"];
    if (typeof start === "string") return new Date(start).getTime();
    if (typeof start === "number") return start;
  }
  return 0;
}

/**
 * Converts DQL records to chart-ready [{timestamp, value}] points.
 *
 * Handles two shapes:
 *
 *  A) `timeseries` command — each record has PARALLEL ARRAYS for the time
 *     column and the value column:
 *       timeframe: [{start,end}, {start,end}, …]   (one per bucket)
 *       val:       [3.1, 4.2, null, 5.0, …]
 *     We zip them into one point per bucket, skipping null/NaN values.
 *
 *  B) `fetch … | summarize … by:{interval=bin(…)}` — each record has
 *     a SCALAR timestamp and a SCALAR value.
 */
export function toChartSeries(
  records: Record<string, unknown>[] | null,
  timeKey = "interval",
  valueKey = "val"
): Array<{ timestamp: number; value: number }> {
  if (!records || records.length === 0) return [];

  const result: Array<{ timestamp: number; value: number }> = [];

  for (const r of records) {
    const tsCol = r[timeKey];
    const valCol = r[valueKey];

    if (Array.isArray(valCol)) {
      // ── Shape A: timeseries paired arrays ─────────────────────────────────
      const valArr = valCol as unknown[];

      if (Array.isArray(tsCol)) {
        // timeframe column is also an array — zip them together
        const tsArr = tsCol as unknown[];
        const len = Math.min(valArr.length, tsArr.length);
        for (let i = 0; i < len; i++) {
          const v = valArr[i];
          if (v == null) continue;
          const ts = resolveTs(tsArr[i]);
          if (ts > 0) result.push({ timestamp: ts, value: Number(v) });
        }
      } else {
        // timeframe column is a single object — compute buckets from start/end
        const startMs = resolveTs(tsCol);
        let endMs = 0;
        if (tsCol !== null && typeof tsCol === "object") {
          const tf = tsCol as Record<string, unknown>;
          const end = tf["end"] ?? tf["endTime"] ?? tf["to"];
          endMs = typeof end === "string" ? new Date(end).getTime()
                : typeof end === "number" ? end : 0;
        }
        if (startMs > 0 && endMs > startMs && valArr.length > 0) {
          const step = (endMs - startMs) / valArr.length;
          for (let i = 0; i < valArr.length; i++) {
            const v = valArr[i];
            if (v == null) continue;
            result.push({ timestamp: startMs + i * step, value: Number(v) });
          }
        }
      }
    } else {
      // ── Shape B: scalar row from fetch+summarize ───────────────────────────
      const ts = resolveTs(tsCol);
      if (ts > 0) {
        result.push({
          timestamp: ts,
          value: typeof valCol === "number" ? valCol : Number(valCol ?? 0),
        });
      }
    }
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
}

/** Sum all values in a chart series. */
export function seriesTotal(series: Array<{ value: number }>): number {
  return series.reduce((acc, p) => acc + (p.value || 0), 0);
}

/** Average value across a series. */
export function seriesAvg(series: Array<{ value: number }>): number {
  if (series.length === 0) return 0;
  return seriesTotal(series) / series.length;
}

/** Format large numbers (1200000 → "1.2M"). */
export function formatCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

/** Format bytes to human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_099_511_627_776) return `${(bytes / 1_099_511_627_776).toFixed(2)} TB`;
  if (bytes >= 1_073_741_824)     return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576)         return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1_024)             return `${(bytes / 1_024).toFixed(2)} KB`;
  return `${bytes} B`;
}

/** GB from bytes. */
export function bytesToGb(bytes: number): number {
  return bytes / 1_073_741_824;
}

/** Divide total by hours to get average per-hour rate. */
export function perHour(total: number, hours: number): number {
  return hours > 0 ? total / hours : 0;
}

/** Format a bytes/h rate as GB/h with automatic unit scaling. */
export function formatGbPerHour(bytesPerHour: number): string {
  const gbH = bytesPerHour / 1_073_741_824;
  if (gbH >= 1_000) return `${(gbH / 1_000).toFixed(2)} TB/h`;
  if (gbH >= 1)     return `${gbH.toFixed(3)} GB/h`;
  const mbH = bytesPerHour / 1_048_576;
  if (mbH >= 1)     return `${mbH.toFixed(2)} MB/h`;
  return `${(bytesPerHour / 1_024).toFixed(1)} KB/h`;
}

/** Format a GB value as "X.XX GB/h". */
export function formatGbH(gb: number): string {
  if (gb >= 1_000) return `${(gb / 1_000).toFixed(2)} TB/h`;
  if (gb >= 1)     return `${gb.toFixed(2)} GB/h`;
  if (gb * 1024 >= 1) return `${(gb * 1024).toFixed(2)} MB/h`;
  return `${(gb * 1_048_576).toFixed(1)} KB/h`;
}

/** Format a generic per-hour rate with K/M scaling. */
export function formatRatePerHour(ratePerHour: number, unit: string): string {
  if (ratePerHour >= 1_000_000) return `${(ratePerHour / 1_000_000).toFixed(2)}M ${unit}/h`;
  if (ratePerHour >= 1_000)     return `${(ratePerHour / 1_000).toFixed(1)}K ${unit}/h`;
  return `${ratePerHour.toFixed(1)} ${unit}/h`;
}
