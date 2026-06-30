import { useMemo } from "react";
import { useDql } from "./useDql";
import { useRateCard } from "./useRateCard";
import { computeCost, type BillingDetailRow } from "../utils/costEngine";
import { billingDetailByTypeQuery } from "../queries";
import type { TimeRangeOption } from "../types";

export interface CapabilityCosts {
  isLoading: boolean;
  error: string | null;
  /** USD cost per capability name (lower-cased key). */
  costByCapability: Map<string, number>;
  totalCost: number;
  /** Sum the USD cost of all capabilities whose name starts with `prefix`. */
  costForPrefix: (prefix: string) => number;
}

/**
 * Per-capability billing cost for the given timeframe, priced with the
 * environment rate card. Lets each tab show how much its signals cost and
 * estimate the cost of the biggest offenders (by their consumption share).
 */
export function useCapabilityCosts(timeRange: TimeRangeOption): CapabilityCosts {
  const rateCard = useRateCard();
  const detailQ = useDql<BillingDetailRow>(
    useMemo(() => billingDetailByTypeQuery(timeRange), [timeRange]),
  );

  return useMemo<CapabilityCosts>(() => {
    const breakdown = computeCost(
      (detailQ.data as BillingDetailRow[]) ?? [],
      rateCard.ratesByName,
      timeRange.hours,
    );
    const costByCapability = new Map<string, number>();
    for (const row of breakdown.rows) {
      costByCapability.set(row.capability.toLowerCase(), row.cost);
    }
    const costForPrefix = (prefix: string) => {
      const p = prefix.toLowerCase();
      let sum = 0;
      for (const [name, cost] of costByCapability) {
        if (name.startsWith(p)) sum += cost;
      }
      return sum;
    };
    return {
      isLoading: rateCard.isLoading || detailQ.isLoading,
      error: detailQ.error,
      costByCapability,
      totalCost: breakdown.totalCost,
      costForPrefix,
    };
  }, [detailQ.data, detailQ.isLoading, detailQ.error, rateCard.ratesByName, rateCard.isLoading, timeRange.hours]);
}
