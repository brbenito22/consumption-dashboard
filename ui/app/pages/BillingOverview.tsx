import React, { useMemo, useState } from "react";
import { Flex, Divider } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { SettingIcon } from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { PageHeader } from "../components/PageHeader";
import { RateCardSetupBanner } from "../components/RateCardSetupBanner";
import { BudgetPanel } from "../components/BudgetPanel";
import { SelfCostFooter } from "../components/SelfCostFooter";
import { CapabilityBreakdownSection } from "../components/CapabilityBreakdownSection";
import { BillingCostSummary } from "../components/BillingCostSummary";
import { BillingTrendSection } from "../components/BillingTrendSection";
import { CapabilityDetailSheet } from "./CapabilityDetailSheet";
import { useDql } from "../hooks/useDql";
import { useRateCard } from "../hooks/useRateCard";
import { useBillingPeriod } from "../hooks/useBillingPeriod";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import {
  computeCost,
  computeCostTrend,
  binHoursOf,
  deltaOrNew,
  type BillingDetailRow,
  type BillingTrendRow,
} from "../utils/costEngine";
import { fmtHours } from "../utils/format";
import { billingDetailByTypeQuery, billingCostTrendQuery, billingDetailByTypePrevQuery } from "../queries";
import { rateCardSettingsUrl } from "../utils/settingsLink";
import { normalizeCapabilityName } from "../constants/rateCard";
import { TIME_RANGE_OPTIONS, type TimeRangeOption } from "../types";

interface BillingOverviewProps { timeRange: TimeRangeOption; }

const HOURS_PER_MONTH = 730;
// Fixed basis for the monthly/annual run-rate projection (trailing 30 days).
const PROJECTION_RANGE = TIME_RANGE_OPTIONS.find((t) => t.value === "30d") ?? TIME_RANGE_OPTIONS[4];

// ── Explanatory content for the information overlays (Dynatrace "i") ──────────
const InfoBlock: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Flex flexDirection="column" gap={8} style={{ maxWidth: 360 }}>
    <Heading level={6} style={{ margin: 0 }}>{title}</Heading>
    {children}
  </Flex>
);

const para: React.CSSProperties = { color: Colors.Text.Neutral.Default, margin: 0 };

type TFn = (key: import("../i18n/strings").StringKey, vars?: Record<string, string | number>) => string;

const projectionInfo = (t: TFn, kind: "monthly" | "annual") => (
  <InfoBlock title={t(kind === "monthly" ? "info.projection.titleMonthly" : "info.projection.titleAnnual")}>
    <Text textStyle="small" style={para}>{t(kind === "monthly" ? "info.projection.monthlyP1" : "info.projection.annualP1")}</Text>
    <Text textStyle="small" style={para}>{t("info.projection.p2")}</Text>
    <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, margin: 0 }}>{t("info.projection.p3")}</Text>
  </InfoBlock>
);

const officialCostInfo = (t: TFn, oc: { currency: string; periodFrom?: string; periodTo?: string }) => (
  <InfoBlock title={t("info.official.title")}>
    <Text textStyle="small" style={para}>{t("info.official.p1", { currency: oc.currency })}</Text>
    <Text textStyle="small" style={para}>
      {t("info.official.p2", { period: oc.periodFrom ? ` (${oc.periodFrom} → ${oc.periodTo})` : "" })}
    </Text>
    <Text textStyle="small" style={para}>{t("info.official.p3")}</Text>
  </InfoBlock>
);

/** Drill-down sheet numbers for the selected capability: official first, Grail fallback. */
function sheetCosts(
  selected: { capability: string; cost: number } | null,
  officialFor: (cap: string) => { periodTotal: number; last30: number | null; prev30: number | null } | undefined,
  last30ByCap: Map<string, number>,
  prev30ByCap: Map<string, number>,
) {
  if (!selected) return { cost: null as number | null, cost30: null as number | null, prevCost30: null as number | null };
  const o = officialFor(selected.capability);
  return {
    cost: o?.periodTotal ?? selected.cost,
    cost30: (o?.last30 ?? last30ByCap.get(selected.capability)) ?? null,
    prevCost30: (o?.prev30 ?? prev30ByCap.get(selected.capability)) ?? null,
  };
}

export const BillingOverview: React.FC<BillingOverviewProps> = () => {
  const { money } = useCurrency();
  const { t } = useLang();

  const rateCard = useRateCard();

  // FIXED cost window aligned with Account Management (billing period when the
  // account rate card is configured; trailing 30d otherwise). The global
  // timeframe selector is hidden on this tab and deliberately ignored here —
  // one window, same basis as the official Cost & Usage view, no divergence.
  const billingPeriod = useBillingPeriod();
  const timeRange = billingPeriod.range;
  const detailQ = useDql<BillingDetailRow>(useMemo(() => billingDetailByTypeQuery(timeRange), [timeRange]));

  // Fixed trailing-30-day query — the basis for the run-rate projections, so
  // they don't shift when the viewing timeframe changes. When the selected
  // timeframe IS 30d, the session query cache dedups this (no extra scan).
  const projDetailQ = useDql<BillingDetailRow>(useMemo(() => billingDetailByTypeQuery(PROJECTION_RANGE), []));

  const loading = rateCard.isLoading || detailQ.isLoading;
  const queryError = detailQ.error ?? null;

  // ── End-to-end cost: consumption × environment rate card ───────────────────
  const breakdown = useMemo(
    () => computeCost((detailQ.data as BillingDetailRow[]) ?? [], rateCard.ratesByName, timeRange.hours),
    [detailQ.data, rateCard.ratesByName, timeRange.hours],
  );

  // Run-rate projection: real cost over the last 30 days, normalized to a month.
  const projBreakdown = useMemo(
    () => computeCost((projDetailQ.data as BillingDetailRow[]) ?? [], rateCard.ratesByName, PROJECTION_RANGE.hours),
    [projDetailQ.data, rateCard.ratesByName],
  );

  const periodCost = breakdown.totalCost;
  const monthlyCost = projBreakdown.totalCost * (HOURS_PER_MONTH / PROJECTION_RANGE.hours);
  const annualCost = monthlyCost * 12;
  const projLoading = rateCard.isLoading || projDetailQ.isLoading;

  // ── Cost over time + 30d-vs-previous-30d comparison ────────────────────────
  // All read dt.system.events (~0 GB scan) — no added consumption for the tab.
  // Deltas deliberately use a 30d basis (like Account Management's "Last 0-30
  // days" column): the billing-period-to-date vs its preceding window crosses
  // the previous contract cycle and produces misleading growth percentages.
  const trendQ = useDql<BillingTrendRow>(useMemo(() => billingCostTrendQuery(timeRange), [timeRange]));
  const prevDetailQ = useDql<BillingDetailRow>(useMemo(() => billingDetailByTypePrevQuery(PROJECTION_RANGE), []));

  const trend = useMemo(
    () => computeCostTrend((trendQ.data as BillingTrendRow[]) ?? [], rateCard.ratesByName, binHoursOf(timeRange.binInterval)),
    [trendQ.data, rateCard.ratesByName, timeRange.binInterval],
  );
  // Previous 30d (now()-60d → now()-30d); current 30d is projBreakdown above.
  const prev30Breakdown = useMemo(
    () => computeCost((prevDetailQ.data as BillingDetailRow[]) ?? [], rateCard.ratesByName, PROJECTION_RANGE.hours),
    [prevDetailQ.data, rateCard.ratesByName],
  );

  const last30ByCap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of projBreakdown.rows) if (!r.unmatched) m.set(r.capability, r.cost);
    return m;
  }, [projBreakdown.rows]);
  const prev30ByCap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of prev30Breakdown.rows) if (!r.unmatched) m.set(r.capability, r.cost);
    return m;
  }, [prev30Breakdown.rows]);

  // ── OFFICIAL per-capability costs (Subscription API — same source as AM) ───
  const officialFor = (cap: string) => rateCard.officialByCap.get(normalizeCapabilityName(cap));
  const hasOfficialCaps = rateCard.officialByCap.size > 0;
  const officialTotals = useMemo(() => {
    let l30 = 0, p30 = 0, hasWindows = false;
    for (const c of rateCard.officialByCap.values()) {
      if (c.last30 !== null) { l30 += c.last30; hasWindows = true; }
      if (c.prev30 !== null) p30 += c.prev30;
    }
    return hasWindows ? { last30: l30, prev30: p30 } : null;
  }, [rateCard.officialByCap]);

  // Prefer OFFICIAL 30d windows when the API is time-sliced; fall back to the
  // Grail estimate otherwise.
  const totalDelta = useMemo(
    () => officialTotals
      ? deltaOrNew(officialTotals.last30, officialTotals.prev30)
      : deltaOrNew(projBreakdown.totalCost, prev30Breakdown.totalCost),
    [officialTotals, projBreakdown.totalCost, prev30Breakdown.totalCost],
  );
  const totalPrev30Display = officialTotals ? officialTotals.prev30 : prev30Breakdown.totalCost;

  // Reconciliation vs the authoritative Subscription-API cost (same window).
  const reconPct = useMemo(() => {
    const oc = rateCard.officialCost;
    if (!oc || oc.total <= 0 || periodCost <= 0) return null;
    return ((periodCost - oc.total) / oc.total) * 100;
  }, [rateCard.officialCost, periodCost]);

  const totalCostSeries = useMemo(
    () => trend.total.map((p) => ({ timestamp: p.timestamp, value: p.cost })),
    [trend.total],
  );
  const trendLoading = rateCard.isLoading || trendQ.isLoading || prevDetailQ.isLoading;

  // Capability drill-down sheet (Cloud-tab pattern) — selection by name.
  const [selectedCap, setSelectedCap] = useState<string | null>(null);
  const selectedIdx = useMemo(
    () => breakdown.rows.findIndex((r) => r.capability === selectedCap),
    [breakdown.rows, selectedCap],
  );
  const selectedRow = selectedIdx >= 0 ? breakdown.rows[selectedIdx] : null;
  const selectedSeries = useMemo(
    () => (selectedCap ? trend.byCapability.get(selectedCap) ?? [] : []),
    [selectedCap, trend.byCapability],
  );
  const sheet = sheetCosts(selectedRow, officialFor, last30ByCap, prev30ByCap);

  return (
    <Flex flexDirection="column" gap={24} padding={24}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Billing & Cost Analysis"
        subtitle={
          <>
            {t("billing.subtitle", {
              window: fmtHours(timeRange.hours),
              source: rateCard.source === "account" ? t("billing.source.account") : t("billing.source.default"),
              currency: rateCard.officialCost?.currency || rateCard.currency,
            })}
            {" "}
            {billingPeriod.aligned
              ? t("billing.periodAligned", { from: billingPeriod.periodFrom ?? "" })
              : t("billing.periodFallback")}
            {rateCard.error ? ` Rate card notice: ${rateCard.error} — using default prices.` : ""}
            {!rateCard.officialCost && rateCard.officialCostDiag ? ` Official cost diagnostic: ${rateCard.officialCostDiag}.` : ""}
          </>
        }
        actions={
          <Button as="a" href={rateCardSettingsUrl()} target="_blank" variant="emphasized">
            <Button.Prefix><SettingIcon /></Button.Prefix>
            Configure rate card
          </Button>
        }
      />

      <RateCardSetupBanner />

      {/* ── Cost summary ─────────────────────────────────────────────────────── */}
      <BillingCostSummary
        breakdown={breakdown}
        loading={loading}
        queryError={queryError}
        periodCost={periodCost}
        monthlyCost={monthlyCost}
        annualCost={annualCost}
        projLoading={projLoading}
        projError={projDetailQ.error}
        reconPct={reconPct}
        billingPeriod={{ aligned: billingPeriod.aligned, periodFrom: billingPeriod.periodFrom ?? null }}
        windowHours={timeRange.hours}
        projectionInfoMonthly={projectionInfo(t, "monthly")}
        projectionInfoAnnual={projectionInfo(t, "annual")}
        officialInfo={rateCard.officialCost ? officialCostInfo(t, rateCard.officialCost) : null}
      />

      {/* ── Budget summary (annual commitment) — mirrors Account Management ─── */}
      <BudgetPanel trendTotal={trend.total} annualProjection={annualCost} />

      <Divider />

      {/* ── Cost over time + previous-period comparison ──────────────────────── */}
      <BillingTrendSection
        series={totalCostSeries}
        isLoading={trendLoading}
        chartError={trendQ.error}
        deltaError={prevDetailQ.error}
        totalDelta={totalDelta}
        prevTotal={totalPrev30Display}
        windowHours={timeRange.hours}
        binInterval={timeRange.binInterval}
      />

      <Divider />

      {/* ── Cost per capability (cards ⇄ table + CSV) ────────────────────────── */}
      <CapabilityBreakdownSection
        breakdown={breakdown}
        loading={loading}
        periodCost={periodCost}
        last30ByCap={last30ByCap}
        prev30ByCap={prev30ByCap}
        onSelect={setSelectedCap}
      />

      <Divider />

      {/* ── Footer: safeguard note + app self-cost estimate ───────────────────── */}
      <SelfCostFooter />

      {/* ── Per-capability drill-down (Cloud-tab pattern) ─────────────────────
          Purely presentational — reuses the trend + prev-window data already
          fetched above, so opening it costs zero additional Grail scan. */}
      <CapabilityDetailSheet
        capability={selectedRow ? { ...selectedRow, cost: sheet.cost ?? selectedRow.cost } : null}
        series={selectedSeries}
        cost30={sheet.cost30}
        prevCost30={sheet.prevCost30}
        colorIndex={Math.max(selectedIdx, 0)}
        timeRange={timeRange}
        onDismiss={() => setSelectedCap(null)}
      />
    </Flex>
  );
};
