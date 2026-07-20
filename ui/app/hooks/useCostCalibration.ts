import { useMemo } from "react";
import { useDql } from "./useDql";
import { useRateCard } from "./useRateCard";
import { useBillingPeriod } from "./useBillingPeriod";
import { computeCost, type BillingDetailRow } from "../utils/costEngine";
import { billingDetailByTypeQuery } from "../queries";
import { normalizeCapabilityName } from "../constants/rateCard";

export interface CostCalibration {
  /**
   * Multiplier that aligns a Grail×rate-card cost estimate with the OFFICIAL
   * Subscription-API cost for that capability (captures DPS contract
   * allowances the raw quantities can't express — e.g. traces ≈ ×0.87).
   * Returns 1 when no official figure exists (estimation stands as-is).
   */
  factorFor: (capabilityName: string) => number;
  isLoading: boolean;
}

/**
 * Per-capability calibration: official billing-period cost ÷ estimated
 * billing-period cost. Applying the factor to ANY window keeps every tab's
 * cost figures proportional to (and, over the full period, identical to) the
 * numbers Account Management shows — the whole app speaks one language.
 *
 * COST NOTE: the detail query string is identical to the Billing tab's and
 * the panels' — the useDql session cache dedups it, so this hook adds ZERO
 * Grail scan wherever it is mounted.
 */
export function useCostCalibration(): CostCalibration {
  const rateCard = useRateCard();
  const billingPeriod = useBillingPeriod();
  const detailQ = useDql<BillingDetailRow>(
    useMemo(() => billingDetailByTypeQuery(billingPeriod.range), [billingPeriod.range]),
  );

  return useMemo<CostCalibration>(() => {
    const factors = new Map<string, number>();
    if (rateCard.officialByCap.size > 0 && detailQ.data) {
      const breakdown = computeCost(
        (detailQ.data as BillingDetailRow[]) ?? [],
        rateCard.ratesByName,
        billingPeriod.range.hours,
      );
      for (const row of breakdown.rows) {
        if (row.unmatched || row.cost <= 0) continue;
        const key = normalizeCapabilityName(row.capability);
        const official = rateCard.officialByCap.get(key);
        if (official && official.periodTotal > 0) {
          factors.set(key, official.periodTotal / row.cost);
        }
      }
    }
    return {
      factorFor: (capabilityName: string) =>
        factors.get(normalizeCapabilityName(capabilityName)) ?? 1,
      isLoading: rateCard.isLoading || detailQ.isLoading,
    };
  }, [rateCard.officialByCap, rateCard.ratesByName, rateCard.isLoading, detailQ.data, detailQ.isLoading, billingPeriod.range.hours]);
}
