import { useMemo } from "react";
import { useDql } from "./useDql";
import { useRateCard } from "./useRateCard";
import { useBillingPeriod } from "./useBillingPeriod";
import { useCostCalibration } from "./useCostCalibration";
import { priceDetailRow, type BillingDetailRow } from "../utils/costEngine";
import { costAllocationQuery, type CostAllocationField } from "../queries";
import { normalizeCapabilityName } from "../constants/rateCard";

/** A capability line inside a team tile. */
export interface AllocCapability {
  capability: string;
  cost: number;
}

/** One tile = one cost center or product. */
export interface AllocTile {
  /** Allocation key ("unassigned" for the not-allocated bucket). */
  key: string;
  isUnassigned: boolean;
  totalCost: number;
  /** Cost per capability WITHIN this team, sorted desc. */
  capabilities: AllocCapability[];
}

export type AllocStatus = "unconfigured" | "partial" | "configured";

export interface AllocationState {
  isLoading: boolean;
  error: string | null;
  /** unconfigured = every event is unassigned; partial = some allocated + an
   *  unassigned remainder; configured = fully (or nearly) allocated. */
  status: AllocStatus;
  /** Allocated cost ÷ total cost (0..1). */
  coverage: number;
  /** Total priced cost across all keys (allocated + unassigned). */
  totalCost: number;
  tilesByCc: AllocTile[];
  tilesByProduct: AllocTile[];
}

interface AllocRow extends BillingDetailRow {
  alloc?: unknown;
  event_type?: unknown;
}

/**
 * Detects and breaks down cost by allocation key (cost center / product),
 * entirely from dt.system.events (~0 GB scan) over the fixed billing-period
 * window. Costs use the same calibrated rate-card basis as the Billing tab, so
 * a team's totals reconcile with the official per-capability numbers.
 *
 * On a tenant WITHOUT Cost Allocation configured (e.g. Paytrack today) every
 * key resolves to "unassigned" → status "unconfigured" and coverage 0 — the
 * page renders its explanatory empty state.
 */
export function useCostAllocation(): AllocationState {
  const { range } = useBillingPeriod();
  const rateCard = useRateCard();
  const calibration = useCostCalibration();

  const ccQ   = useDql<AllocRow>(useMemo(() => costAllocationQuery(range, "costcenter"), [range]));
  const prodQ = useDql<AllocRow>(useMemo(() => costAllocationQuery(range, "product"), [range]));

  return useMemo<AllocationState>(() => {
    const buildTiles = (rows: AllocRow[] | null | undefined): AllocTile[] => {
      const byAlloc = new Map<string, { total: number; caps: Map<string, number> }>();
      for (const row of (rows ?? [])) {
        const capability = String(row.event_type ?? "");
        const rate = rateCard.ratesByName.get(normalizeCapabilityName(capability));
        if (!rate) continue;
        const cost = priceDetailRow(row, rate, range.hours) * calibration.factorFor(capability);
        if (cost <= 0) continue;
        const key = String(row.alloc ?? "unassigned") || "unassigned";
        const entry = byAlloc.get(key) ?? { total: 0, caps: new Map<string, number>() };
        entry.total += cost;
        entry.caps.set(capability, (entry.caps.get(capability) ?? 0) + cost);
        byAlloc.set(key, entry);
      }
      const tiles: AllocTile[] = [...byAlloc.entries()].map(([key, v]) => ({
        key,
        isUnassigned: key === "unassigned",
        totalCost: v.total,
        capabilities: [...v.caps.entries()]
          .map(([capability, cost]) => ({ capability, cost }))
          .sort((a, b) => b.cost - a.cost),
      }));
      // Allocated teams by cost desc; "unassigned" always last.
      tiles.sort((a, b) => (a.isUnassigned ? 1 : 0) - (b.isUnassigned ? 1 : 0) || b.totalCost - a.totalCost);
      return tiles;
    };

    const tilesByCc = buildTiles(ccQ.data as AllocRow[]);
    const tilesByProduct = buildTiles(prodQ.data as AllocRow[]);

    // Status + coverage derived from the cost-center view (the primary axis).
    const totalCost = tilesByCc.reduce((s, t) => s + t.totalCost, 0);
    const allocatedCost = tilesByCc.filter((t) => !t.isUnassigned).reduce((s, t) => s + t.totalCost, 0);
    const coverage = totalCost > 0 ? allocatedCost / totalCost : 0;
    const hasAllocated = tilesByCc.some((t) => !t.isUnassigned);
    const status: AllocStatus = !hasAllocated ? "unconfigured" : coverage >= 0.999 ? "configured" : "partial";

    return {
      isLoading: rateCard.isLoading || calibration.isLoading || ccQ.isLoading || prodQ.isLoading,
      error: ccQ.error ?? prodQ.error,
      status,
      coverage,
      totalCost,
      tilesByCc,
      tilesByProduct,
    };
  }, [ccQ.data, prodQ.data, ccQ.isLoading, prodQ.isLoading, ccQ.error, prodQ.error, rateCard.ratesByName, rateCard.isLoading, calibration, range.hours]);
}
