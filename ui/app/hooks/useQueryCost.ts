import { useMemo } from "react";
import { useDql } from "./useDql";
import { useRateCard } from "./useRateCard";
import { useBillingPeriod } from "./useBillingPeriod";
import { useCostCalibration } from "./useCostCalibration";
import { priceDetailRow, type BillingDetailRow } from "../utils/costEngine";
import {
  queryCostQuery,
  queryCostByDashboardQuery,
  repeatedQueriesQuery,
  queryCostTotalsQuery,
  repeatedQueriesTotalQuery,
} from "../queries";
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
  /** Top offenders only (top 25) — `wastedCost`/`wastedGib` cover ALL groups. */
  repeated: RepeatedQuery[];
  /** Cost of repeats beyond the first execution — the recoverable slice. */
  wastedCost: number;
  wastedGib: number;
  /**
   * Official Subscription-API cost for the "- Query" capabilities, when the
   * account exposes per-capability figures. Lets the tab prove its numbers
   * reconcile with Account Management instead of asking to be trusted.
   */
  officialQueryCost: number | null;
  /** (estimate − official) ÷ official, in %. Null when official is missing. */
  reconPct: number | null;
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
  // Exact totals — see queryCostTotalsQuery: the ranking queries are top-N and
  // would under-report the headline figures on a busy tenant.
  const totalsQ      = useDql<QueryRow>(useMemo(() => queryCostTotalsQuery(range), [range]));
  const wasteTotalQ  = useDql<BillingDetailRow>(useMemo(() => repeatedQueriesTotalQuery(range), [range]));

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

    // ── Headline totals from the per-capability query (never truncated) ─────
    const totalRows = (totalsQ.data as QueryRow[]) ?? [];
    const totalCost    = totalRows.reduce((s, r) => s + priceOf(r, String(r.event_type ?? "")), 0);
    const totalGib     = totalRows.reduce((s, r) => s + n(r.data_gib), 0);
    const totalQueries = totalRows.reduce((s, r) => s + n(r.queries), 0);
    const aiQueries    = totalRows.reduce((s, r) => s + n(r.ai_queries), 0);
    const maxGib       = totalRows.reduce((m, r) => Math.max(m, n(r.max_bytes) / GIB), 0);

    // Official cost for the same "- Query" capabilities, when exposed.
    let officialQueryCost: number | null = null;
    for (const r of totalRows) {
      const official = rateCard.officialByCap.get(normalizeCapabilityName(String(r.event_type ?? "")));
      if (official) officialQueryCost = (officialQueryCost ?? 0) + official.periodTotal;
    }
    const reconPct = officialQueryCost !== null && officialQueryCost > 0
      ? ((totalCost - officialQueryCost) / officialQueryCost) * 100
      : null;

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

    // Waste totals cover EVERY repeat group, not just the 25 in the table.
    const wasteRows = (wasteTotalQ.data as BillingDetailRow[]) ?? [];
    const wastedGib = wasteRows.reduce((s, r) => s + n(r.data_gib), 0);
    const wastedCost = wasteRows.reduce((s, r) => s + priceOf(r, String(r.event_type ?? "")), 0);

    return {
      isLoading: rateCard.isLoading || calibration.isLoading || spendQ.isLoading
        || dashQ.isLoading || repeatQ.isLoading || totalsQ.isLoading || wasteTotalQ.isLoading,
      error: spendQ.error ?? dashQ.error ?? repeatQ.error ?? totalsQ.error ?? wasteTotalQ.error,
      totalCost,
      totalGib,
      totalQueries,
      aiQueries,
      maxGib,
      byUser,
      byApp,
      byDashboard,
      repeated,
      wastedCost,
      wastedGib,
      officialQueryCost,
      reconPct,
    };
  }, [
    spendQ.data, spendQ.isLoading, spendQ.error,
    dashQ.data, dashQ.isLoading, dashQ.error,
    repeatQ.data, repeatQ.isLoading, repeatQ.error,
    totalsQ.data, totalsQ.isLoading, totalsQ.error,
    wasteTotalQ.data, wasteTotalQ.isLoading, wasteTotalQ.error,
    rateCard.ratesByName, rateCard.officialByCap, rateCard.isLoading, calibration, range.hours,
  ]);
}
