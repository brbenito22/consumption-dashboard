import { useMemo } from "react";
import { useDql } from "./useDql";
import { useRateCard } from "./useRateCard";
import { useBillingPeriod } from "./useBillingPeriod";
import { useCostCalibration } from "./useCostCalibration";
import { priceDetailRow, type BillingDetailRow } from "../utils/costEngine";
import { queryCostQuery, queryCostByDashboardQuery, repeatedQueriesQuery } from "../queries";
import { normalizeCapabilityName } from "../constants/rateCard";

/** One spender row — a user, or an app, depending on the axis. */
export interface QuerySpender {
  key: string;
  cost: number;
  gib: number;
  queries: number;
  /** Largest single query attributed to this key, in GiB. */
  maxGib: number;
  /** Average GiB scanned per query — the "is this query shaped badly" signal. */
  avgGib: number;
  /** Cost per capability within this key, desc. */
  capabilities: { capability: string; cost: number }[];
}

/** A dashboard spender — `key` is the dashboard id from client.source. */
export interface DashboardSpender extends QuerySpender {
  /** Distinct people who loaded it (max across capabilities, so no double count). */
  viewers: number;
}

/** A query re-executed with a byte-identical scan — mechanical, not human. */
export interface RepeatedQuery {
  actor: string;
  app: string;
  capability: string;
  gibEach: number;
  repeats: number;
  wastedGib: number;
  wastedCost: number;
  firstSeen: string;
  lastSeen: string;
}

export interface QueryCostState {
  isLoading: boolean;
  error: string | null;
  totalCost: number;
  totalGib: number;
  totalQueries: number;
  aiQueries: number;
  /** Largest single query observed in the window, in GiB. */
  maxGib: number;
  byUser: QuerySpender[];
  byApp: QuerySpender[];
  byDashboard: DashboardSpender[];
  repeated: RepeatedQuery[];
  /** Cost of repeats beyond the first execution — the recoverable slice. */
  wastedCost: number;
  wastedGib: number;
}

interface QueryRow extends BillingDetailRow {
  actor?: unknown;
  app?: unknown;
  queries?: unknown;
  ai_queries?: unknown;
  max_bytes?: unknown;
}

interface DashboardRow extends BillingDetailRow {
  dashboard_id?: unknown;
  queries?: unknown;
  viewers?: unknown;
  max_bytes?: unknown;
}

interface RepeatRow extends BillingDetailRow {
  actor?: unknown;
  app?: unknown;
  repeats?: unknown;
  gib_each?: unknown;
  wasted_gib?: unknown;
  first_seen?: unknown;
  last_seen?: unknown;
}

const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return isFinite(x) ? x : 0;
};

const GIB = 1073741824;

/**
 * Breaks Grail QUERY spend down by who ran it and which app it came from, and
 * flags queries that are being re-executed mechanically.
 *
 * Account Management reports query cost as one lump per capability. The billing
 * usage events actually carry `user.email`, `client.application_context` and
 * `ai_generated`, so the same ~0 GB scan answers "who" and "from where" — the
 * two questions you need to actually cut the bill.
 *
 * Costs run through the same rate card × calibration basis as every other tab,
 * so the per-user numbers add up to the official Query capability totals.
 */
export function useQueryCost(): QueryCostState {
  const { range } = useBillingPeriod();
  const rateCard = useRateCard();
  const calibration = useCostCalibration();

  const spendQ  = useDql<QueryRow>(useMemo(() => queryCostQuery(range), [range]));
  const dashQ   = useDql<DashboardRow>(useMemo(() => queryCostByDashboardQuery(range), [range]));
  const repeatQ = useDql<RepeatRow>(useMemo(() => repeatedQueriesQuery(range), [range]));

  return useMemo<QueryCostState>(() => {
    const rows = (spendQ.data as QueryRow[]) ?? [];

    // Price a row against its capability's rate, calibrated to the official cost.
    const priceOf = (row: BillingDetailRow, capability: string): number => {
      const rate = rateCard.ratesByName.get(normalizeCapabilityName(capability));
      if (!rate) return 0;
      return priceDetailRow(row, rate, range.hours) * calibration.factorFor(capability);
    };

    const build = (keyOf: (r: QueryRow) => string): QuerySpender[] => {
      const acc = new Map<string, { cost: number; gib: number; queries: number; maxGib: number; caps: Map<string, number> }>();
      for (const row of rows) {
        const capability = String(row.event_type ?? "");
        const cost = priceOf(row, capability);
        const key = keyOf(row) || "unknown";
        const e = acc.get(key) ?? { cost: 0, gib: 0, queries: 0, maxGib: 0, caps: new Map<string, number>() };
        e.cost += cost;
        e.gib += n(row.data_gib);
        e.queries += n(row.queries);
        e.maxGib = Math.max(e.maxGib, n(row.max_bytes) / GIB);
        if (cost > 0) e.caps.set(capability, (e.caps.get(capability) ?? 0) + cost);
        acc.set(key, e);
      }
      return [...acc.entries()]
        .map(([key, v]) => ({
          key,
          cost: v.cost,
          gib: v.gib,
          queries: v.queries,
          maxGib: v.maxGib,
          avgGib: v.queries > 0 ? v.gib / v.queries : 0,
          capabilities: [...v.caps.entries()]
            .map(([capability, cost]) => ({ capability, cost }))
            .sort((a, b) => b.cost - a.cost),
        }))
        .sort((a, b) => b.cost - a.cost || b.gib - a.gib);
    };

    const byUser = build((r) => String(r.actor ?? "unknown"));
    const byApp  = build((r) => String(r.app ?? "unknown"));

    // Dashboards come from their own query (the id has to be parsed out of
    // client.source), so they aggregate separately from the user/app rows.
    const dashAcc = new Map<string, { cost: number; gib: number; queries: number; maxGib: number; viewers: number; caps: Map<string, number> }>();
    for (const row of ((dashQ.data as DashboardRow[]) ?? [])) {
      const capability = String(row.event_type ?? "");
      const cost = priceOf(row, capability);
      const key = String(row.dashboard_id ?? "");
      if (!key) continue;
      const e = dashAcc.get(key) ?? { cost: 0, gib: 0, queries: 0, maxGib: 0, viewers: 0, caps: new Map<string, number>() };
      e.cost += cost;
      e.gib += n(row.data_gib);
      e.queries += n(row.queries);
      e.maxGib = Math.max(e.maxGib, n(row.max_bytes) / GIB);
      // max, not sum — the same person can appear under several capabilities.
      e.viewers = Math.max(e.viewers, n(row.viewers));
      if (cost > 0) e.caps.set(capability, (e.caps.get(capability) ?? 0) + cost);
      dashAcc.set(key, e);
    }
    const byDashboard: DashboardSpender[] = [...dashAcc.entries()]
      .map(([key, v]) => ({
        key,
        cost: v.cost,
        gib: v.gib,
        queries: v.queries,
        maxGib: v.maxGib,
        avgGib: v.queries > 0 ? v.gib / v.queries : 0,
        viewers: v.viewers,
        capabilities: [...v.caps.entries()]
          .map(([capability, cost]) => ({ capability, cost }))
          .sort((a, b) => b.cost - a.cost),
      }))
      .sort((a, b) => b.cost - a.cost || b.gib - a.gib);

    const totalCost    = byUser.reduce((s, u) => s + u.cost, 0);
    const totalGib     = byUser.reduce((s, u) => s + u.gib, 0);
    const totalQueries = rows.reduce((s, r) => s + n(r.queries), 0);
    const aiQueries    = rows.reduce((s, r) => s + n(r.ai_queries), 0);
    const maxGib       = rows.reduce((m, r) => Math.max(m, n(r.max_bytes) / GIB), 0);

    const repeated: RepeatedQuery[] = ((repeatQ.data as RepeatRow[]) ?? []).map((r) => {
      const capability = String(r.event_type ?? "");
      const wastedGib = n(r.wasted_gib);
      // Price the wasted slice through the same engine: for "- Query"
      // capabilities rate.unit is "gib", so data_gib is the priced quantity.
      return {
        actor: String(r.actor ?? "unknown"),
        app: String(r.app ?? "unknown"),
        capability,
        gibEach: n(r.gib_each),
        repeats: n(r.repeats),
        wastedGib,
        wastedCost: priceOf({ data_gib: wastedGib }, capability),
        firstSeen: String(r.first_seen ?? ""),
        lastSeen: String(r.last_seen ?? ""),
      };
    });

    return {
      isLoading: rateCard.isLoading || calibration.isLoading || spendQ.isLoading || dashQ.isLoading || repeatQ.isLoading,
      error: spendQ.error ?? dashQ.error ?? repeatQ.error,
      totalCost,
      totalGib,
      totalQueries,
      aiQueries,
      maxGib,
      byUser,
      byApp,
      byDashboard,
      repeated,
      wastedCost: repeated.reduce((s, r) => s + r.wastedCost, 0),
      wastedGib: repeated.reduce((s, r) => s + r.wastedGib, 0),
    };
  }, [
    spendQ.data, spendQ.isLoading, spendQ.error,
    dashQ.data, dashQ.isLoading, dashQ.error,
    repeatQ.data, repeatQ.isLoading, repeatQ.error,
    rateCard.ratesByName, rateCard.isLoading, calibration, range.hours,
  ]);
}
