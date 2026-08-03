import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { KpiCard } from "./KpiCard";
import { useRateCard } from "../hooks/useRateCard";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { fmtNum, fmtGib, fmtHours } from "../utils/format";
import type { CostBreakdown } from "../utils/costEngine";

interface BillingCostSummaryProps {
  breakdown: CostBreakdown;
  loading: boolean;
  queryError: string | null;
  periodCost: number;
  monthlyCost: number;
  annualCost: number;
  projLoading: boolean;
  projError: string | null;
  /** Estimate vs official reconciliation (± %), null when either is missing. */
  reconPct: number | null;
  billingPeriod: { aligned: boolean; periodFrom: string | null };
  windowHours: number;
  /** Info overlay nodes built by the parent (i18n-heavy). */
  projectionInfoMonthly: React.ReactNode;
  projectionInfoAnnual: React.ReactNode;
  officialInfo: React.ReactNode | null;
}

/**
 * "Estimated Cost" KPI row (Billing tab): period cost (official when exposed),
 * run-rate projections, ingest, matched capabilities and the official-cost KPI
 * with its reconciliation note.
 */
export const BillingCostSummary: React.FC<BillingCostSummaryProps> = ({
  breakdown, loading, queryError, periodCost, monthlyCost, annualCost,
  projLoading, projError, reconPct, billingPeriod, windowHours,
  projectionInfoMonthly, projectionInfoAnnual, officialInfo,
}) => {
  const rateCard = useRateCard();
  const { money } = useCurrency();
  const { t } = useLang();

  const hasOfficialCaps = rateCard.officialByCap.size > 0;
  const reconSuffix = reconPct !== null
    ? ` · ≈ ${reconPct > 0 ? "+" : ""}${fmtNum(reconPct, 1)}% ${t("billing.vsOfficial")}`
    : "";
  const estimateSub = billingPeriod.aligned
    ? `${billingPeriod.periodFrom} → today · all capabilities`
    : "fixed 30d window · all capabilities";

  return (
    <Flex flexDirection="column" gap={8}>
      <Heading level={3}>Estimated Cost</Heading>
      <Flex gap={12} flexWrap="wrap">
        <KpiCard
          label={billingPeriod.aligned ? "Cost (billing period)" : `Cost (last ${fmtHours(windowHours)})`}
          value={loading ? "…" : money(hasOfficialCaps && rateCard.officialCost ? rateCard.officialCost.total : periodCost)}
          subLabel={
            hasOfficialCaps
              ? `${billingPeriod.periodFrom ?? ""} → today · Subscription API (= Account Management)`
              : estimateSub + reconSuffix
          }
          isLoading={loading}
          error={queryError}
        />
        <KpiCard label="Monthly projection"  value={projLoading ? "…" : money(monthlyCost)} subLabel="run-rate · based on last 30 days" isLoading={projLoading} error={projError} colorVariant="positive" info={projectionInfoMonthly} />
        <KpiCard label="Annual projection"   value={projLoading ? "…" : money(annualCost)}  subLabel="run-rate · monthly × 12"          isLoading={projLoading} error={projError} colorVariant="warning"  info={projectionInfoAnnual} />
        <KpiCard label="Total ingest"        value={loading ? "…" : fmtGib(breakdown.totalGib)} subLabel="billed GiB (bytes)" isLoading={loading} error={queryError} />
        <KpiCard label="Priced capabilities" value={loading ? "…" : `${breakdown.matchedCount}/${breakdown.matchedCount + breakdown.unmatchedCount}`} subLabel="matched to rate card" isLoading={loading} error={queryError} />
        {rateCard.officialCost && (
          <KpiCard
            label="Dynatrace Official Cost"
            value={money(rateCard.officialCost.total)}
            subLabel={
              rateCard.officialCost.periodFrom
                ? `Dynatrace-billed · ${rateCard.officialCost.periodFrom} → ${rateCard.officialCost.periodTo}`
                : `Dynatrace-billed · authoritative total`
            }
            colorVariant="positive"
            info={officialInfo}
          />
        )}
      </Flex>
      {rateCard.officialCost && (
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
          {hasOfficialCaps
            ? t("billing.officialCaps")
            : <>
                {t("billing.officialNote", { window: fmtHours(windowHours) })}
                {reconPct !== null ? ` ${t("billing.recon", { pct: `${reconPct > 0 ? "+" : ""}${fmtNum(reconPct, 1)}%` })}` : ""}
              </>}
        </Text>
      )}
    </Flex>
  );
};
