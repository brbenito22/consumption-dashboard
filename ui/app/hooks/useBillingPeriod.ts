import { useMemo } from "react";
import { useRateCard } from "./useRateCard";
import { TIME_RANGE_OPTIONS, binForHours, type TimeRangeOption } from "../types";

export interface BillingPeriodState {
  /** Fixed window all COST views use — aligned with Account Management. */
  range: TimeRangeOption;
  /** True when anchored to the real subscription billing period (Subscription API). */
  aligned: boolean;
  /** Display bounds, e.g. "2026-05-30" → "today". */
  periodFrom: string | null;
  periodTo: string | null;
}

const FALLBACK_30D = TIME_RANGE_OPTIONS.find((t) => t.value === "30d") ?? TIME_RANGE_OPTIONS[4];

/**
 * Single source of truth for the COST timeframe. All cost views (Billing tab,
 * per-tab cost panels) use this fixed window instead of the user-selectable
 * timeframe, so the app's numbers stay comparable with Account Management's
 * Cost & Usage screen and never diverge because of a different window.
 *
 * - With the account rate card configured, the window is the REAL billing
 *   period start (Subscription API periodFrom) → now (period-to-date).
 * - Without it, falls back to the trailing 30 days — Account Management's
 *   default "Last 30 days" view.
 */
export function useBillingPeriod(): BillingPeriodState {
  const rateCard = useRateCard();

  return useMemo(() => {
    const from = rateCard.officialCost?.periodFrom;
    const fromDate = from ? new Date(`${from}T00:00:00Z`) : null;

    if (fromDate && isFinite(fromDate.getTime())) {
      const hours = Math.max(24, Math.round((Date.now() - fromDate.getTime()) / 3_600_000));
      const range: TimeRangeOption = {
        label: "Billing period",
        value: "custom",
        dqlFrom: `toTimestamp("${from}T00:00:00Z")`,
        dqlTo: "now()",
        binInterval: binForHours(hours),
        hours,
      };
      return {
        range,
        aligned: true,
        periodFrom: from ?? null,
        periodTo: rateCard.officialCost?.periodTo ?? null,
      };
    }

    return { range: FALLBACK_30D, aligned: false, periodFrom: null, periodTo: null };
  }, [rateCard.officialCost]);
}
