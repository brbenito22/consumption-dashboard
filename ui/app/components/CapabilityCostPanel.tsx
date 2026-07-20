import React, { useMemo, useState } from "react";
import { Surface, Flex, Grid } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useDql } from "../hooks/useDql";
import { useRateCard } from "../hooks/useRateCard";
import { useBillingPeriod } from "../hooks/useBillingPeriod";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import {
  computeCost,
  computeCostTrend,
  binHoursOf,
  type BillingDetailRow,
  type BillingTrendRow,
} from "../utils/costEngine";
import { billingDetailByTypeQuery, billingCostTrendQuery, billingDetailByTypePrevQuery } from "../queries";
import { descriptionFor } from "../constants/capabilityInfo";
import { normalizeCapabilityName } from "../constants/rateCard";
import { chartColor } from "../constants/palette";
import { CapabilityDetailSheet } from "../pages/CapabilityDetailSheet";
import { TIME_RANGE_OPTIONS } from "../types";

// 30d basis for deltas — the same window Account Management's "Last 0-30 days"
// column uses. Query strings are identical to the Billing tab's → cache-deduped.
const RANGE_30D = TIME_RANGE_OPTIONS.find((t) => t.value === "30d") ?? TIME_RANGE_OPTIONS[4];

interface CapabilityCostPanelProps {
  /** Section heading; defaults to the i18n cost-panel title. */
  title?: string;
  /** Keep only capabilities passing this test (default: every priced one). */
  include?: (capabilityName: string) => boolean;
  /** Max cards shown, by cost desc (default 8). */
  limit?: number;
}

const fmtDelta = (pct: number | null): string => {
  if (pct === null || !isFinite(pct)) return "—";
  const arrow = pct > 0.5 ? "▲" : pct < -0.5 ? "▼" : "＝";
  return `${arrow} ${pct > 0 ? "+" : ""}${pct.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
};

/**
 * "Where the money goes" panel — drops into any tab. Shows the tab-relevant
 * capabilities as clickable cost cards (cost, Δ% vs previous equal window,
 * plain-language origin description, share bar) opening the same
 * CapabilityDetailSheet drill-down used by the Billing tab.
 *
 * COST NOTE: uses the exact same three dt.system.events query strings as the
 * Billing tab — the useDql session cache dedups them, so rendering this panel
 * on every tab adds ZERO Grail scan.
 *
 * WINDOW: fixed to the Account Management billing period (useBillingPeriod),
 * NOT the tab's timeframe selector — cost always has one basis, everywhere.
 */
export const CapabilityCostPanel: React.FC<CapabilityCostPanelProps> = ({
  title,
  include,
  limit = 8,
}) => {
  const { money } = useCurrency();
  const { t, lang } = useLang();
  const rateCard = useRateCard();
  const { range: timeRange, aligned, periodFrom } = useBillingPeriod();

  const detailQ   = useDql<BillingDetailRow>(useMemo(() => billingDetailByTypeQuery(timeRange), [timeRange]));
  const trendQ    = useDql<BillingTrendRow>(useMemo(() => billingCostTrendQuery(timeRange), [timeRange]));
  const detail30Q = useDql<BillingDetailRow>(useMemo(() => billingDetailByTypeQuery(RANGE_30D), []));
  const prev30Q   = useDql<BillingDetailRow>(useMemo(() => billingDetailByTypePrevQuery(RANGE_30D), []));

  const breakdown = useMemo(
    () => computeCost((detailQ.data as BillingDetailRow[]) ?? [], rateCard.ratesByName, timeRange.hours),
    [detailQ.data, rateCard.ratesByName, timeRange.hours],
  );
  const breakdown30 = useMemo(
    () => computeCost((detail30Q.data as BillingDetailRow[]) ?? [], rateCard.ratesByName, RANGE_30D.hours),
    [detail30Q.data, rateCard.ratesByName],
  );
  const prev30Breakdown = useMemo(
    () => computeCost((prev30Q.data as BillingDetailRow[]) ?? [], rateCard.ratesByName, RANGE_30D.hours),
    [prev30Q.data, rateCard.ratesByName],
  );
  const trend = useMemo(
    () => computeCostTrend((trendQ.data as BillingTrendRow[]) ?? [], rateCard.ratesByName, binHoursOf(timeRange.binInterval)),
    [trendQ.data, rateCard.ratesByName, timeRange.binInterval],
  );

  const last30ByCap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of breakdown30.rows) if (!r.unmatched) m.set(r.capability, r.cost);
    return m;
  }, [breakdown30.rows]);
  const prev30ByCap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of prev30Breakdown.rows) if (!r.unmatched) m.set(r.capability, r.cost);
    return m;
  }, [prev30Breakdown.rows]);

  // OFFICIAL per-capability costs (Subscription API) override the estimates —
  // same blend the Billing tab applies, so every tab shows identical values.
  const officialFor = (cap: string) => rateCard.officialByCap.get(normalizeCapabilityName(cap));

  const rows = useMemo(() => {
    const priced = breakdown.rows.filter((r) => !r.unmatched && r.quantity > 0);
    const filtered = include ? priced.filter((r) => include(r.capability)) : priced;
    return filtered
      .map((r) => ({ ...r, cost: officialFor(r.capability)?.periodTotal ?? r.cost }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdown.rows, include, limit, rateCard.officialByCap]);

  const groupTotal = useMemo(() => rows.reduce((s, r) => s + r.cost, 0), [rows]);

  const [selectedCap, setSelectedCap] = useState<string | null>(null);
  const selectedIdx = useMemo(() => rows.findIndex((r) => r.capability === selectedCap), [rows, selectedCap]);
  const selectedRow = selectedIdx >= 0 ? rows[selectedIdx] : null;
  const selectedSeries = useMemo(
    () => (selectedCap ? trend.byCapability.get(selectedCap) ?? [] : []),
    [selectedCap, trend.byCapability],
  );

  const isLoading = rateCard.isLoading || detailQ.isLoading;

  if (!isLoading && rows.length === 0) return null;

  return (
    <Flex flexDirection="column" gap={12}>
      <Flex justifyContent="space-between" alignItems="baseline" flexWrap="wrap" gap={8}>
        <Heading level={3}>{title ?? t("costpanel.title")}</Heading>
        <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Default }}>
          {isLoading ? "…" : `${t("costpanel.groupTotal")}: ${money(groupTotal)}`}
        </Text>
      </Flex>
      <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, maxWidth: 760 }}>
        {t("costpanel.subtitle")}{" "}
        {aligned ? t("costpanel.windowAligned", { from: periodFrom ?? "" }) : t("costpanel.windowFallback")}
      </Text>

      <Grid gridTemplateColumns="repeat(auto-fit, minmax(260px, 1fr))" gap={12}>
        {(isLoading ? [] : rows).map((row, idx) => {
          const color = chartColor(idx);
          const sharePct = groupTotal > 0 ? (row.cost / groupTotal) * 100 : 0;
          const o = officialFor(row.capability);
          const cost30 = o?.last30 ?? last30ByCap.get(row.capability);
          const prev30 = (o?.prev30 ?? prev30ByCap.get(row.capability)) ?? 0;
          const isNew = prev30 <= 1 && (cost30 ?? 0) > 1;
          const delta = prev30 > 1 && cost30 !== undefined && cost30 !== null ? ((cost30 - prev30) / prev30) * 100 : null;
          return (
            <div
              key={row.capability}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedCap(row.capability)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedCap(row.capability); }}
              style={{ cursor: "pointer", display: "flex" }}
            >
              <Surface
                elevation="raised"
                style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", position: "relative", overflow: "hidden", flex: 1 }}
              >
                <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: color }} />
                <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Subdued, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {row.capability}
                </Text>
                <Flex justifyContent="space-between" alignItems="baseline" gap={8}>
                  <Heading level={4} style={{ margin: 0 }}>{money(row.cost)}</Heading>
                  {(delta !== null || isNew) && (
                    <Text
                      textStyle="small-emphasized"
                      title={t("billing.delta30")}
                      style={{ color: isNew || (delta !== null && delta > 0.5) ? Colors.Text.Warning.Default : delta !== null && delta < -0.5 ? Colors.Text.Success.Default : Colors.Text.Neutral.Subdued }}
                    >
                      {isNew ? t("delta.new") : fmtDelta(delta)}
                    </Text>
                  )}
                </Flex>
                {cost30 !== undefined && cost30 !== null && (
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
                    {t("billing.last30")}: <strong>{money(cost30)}</strong>
                  </Text>
                )}
                <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, lineHeight: 1.4 }}>
                  {descriptionFor(row.capability, lang)}
                </Text>
                <div style={{ height: 6, borderRadius: 3, background: "var(--dt-color-border-neutral-subtle)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(sharePct, 100)}%`, background: color, borderRadius: 3 }} />
                </div>
                <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
                  {sharePct.toFixed(1)}% {t("costpanel.ofGroup")}
                </Text>
              </Surface>
            </div>
          );
        })}
        {isLoading && <Text>Loading…</Text>}
      </Grid>

      <CapabilityDetailSheet
        capability={selectedRow}
        series={selectedSeries}
        cost30={selectedRow ? (officialFor(selectedRow.capability)?.last30 ?? last30ByCap.get(selectedRow.capability)) ?? null : null}
        prevCost30={selectedRow ? (officialFor(selectedRow.capability)?.prev30 ?? prev30ByCap.get(selectedRow.capability)) ?? null : null}
        colorIndex={Math.max(selectedIdx, 0)}
        timeRange={timeRange}
        onDismiss={() => setSelectedCap(null)}
      />
    </Flex>
  );
};
