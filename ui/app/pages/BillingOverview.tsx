import React, { useMemo, useState } from "react";
import { Surface, Flex, Grid, Divider } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import { SettingIcon } from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { KpiCard } from "../components/KpiCard";
import { PageHeader } from "../components/PageHeader";
import { ConsumptionChart } from "../components/ConsumptionChart";
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
  type BillingDetailRow,
  type BillingTrendRow,
} from "../utils/costEngine";
import { billingDetailByTypeQuery, billingCostTrendQuery, billingDetailByTypePrevQuery } from "../queries";
import { descriptionFor } from "../constants/capabilityInfo";
import { rateCardSettingsUrl } from "../utils/settingsLink";
import { chartColor } from "../constants/palette";
import { normalizeCapabilityName } from "../constants/rateCard";
import { TIME_RANGE_OPTIONS, type TimeRangeOption } from "../types";

// ── Cost Center app self-cost estimate constants ────────────────────────────
// Rough GiB scanned per full user session across all tabs the app renders
// (Overview + Applications + Observability + Billing + Predictions + Cloud +
// Infrastructure). As of v1.51.0 the app migrated logs/events count queries
// to BILLING_USAGE_EVENT (~0 GB) and narrowed top-offender windows 24h→6h.
// The remaining scan is dominated by the 4 fetch-spans top-offender queries.
// Anchored to ~5 GiB per full session (95% cut vs pre-optimization 30 GiB).
const APP_GIB_SCANNED_PER_SESSION = 5;
const APP_SESSIONS_PER_DAY        = 1;   // "daily user" scenario

interface BillingOverviewProps { timeRange: TimeRangeOption; }

const HOURS_PER_MONTH = 730;
const ACCOUNT_MGMT_URL = "https://myaccount.dynatrace.com";
// Fixed basis for the monthly/annual run-rate projection (trailing 30 days).
const PROJECTION_RANGE = TIME_RANGE_OPTIONS.find((t) => t.value === "30d") ?? TIME_RANGE_OPTIONS[4];

// ── Formatting ─────────────────────────────────────────────────────────────────
const fmtNum = (v: number, d = 2) =>
  !isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtGib = (v: number) =>
  v >= 1024 ? `${fmtNum(v / 1024, 2)} TiB` : v >= 1 ? `${fmtNum(v, 2)} GiB` : `${fmtNum(v * 1024, 1)} MiB`;

// Human-friendly window label (avoids fractional hours like "10.3666h").
const fmtHours = (h: number) => {
  if (h >= 48) return `${Math.round(h / 24)}d`;
  if (h >= 1)  return `${Math.round(h)}h`;
  return `${Math.round(h * 60)}min`;
};

// Signed percentage with a direction glyph — "▲ +12.3%" / "▼ -8.1%" / "＝ 0.2%".
const fmtDelta = (pct: number | null): string => {
  if (pct === null || !isFinite(pct)) return "—";
  const arrow = pct > 0.5 ? "▲" : pct < -0.5 ? "▼" : "＝";
  return `${arrow} ${pct > 0 ? "+" : ""}${pct.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
};

// ── Explanatory content for the information overlays (Dynatrace "i") ──────────────
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

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 8, borderRadius: 4, background: "var(--dt-color-border-neutral-subtle)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 4, transition: "width 0.4s ease" }} />
    </div>
  );
}

export const BillingOverview: React.FC<BillingOverviewProps> = () => {
  const { money, unitPrice } = useCurrency();
  const { t, lang } = useLang();

  const rateCard = useRateCard();

  // FIXED cost window aligned with Account Management (billing period when the
  // account rate card is configured; trailing 30d otherwise). The global
  // timeframe selector is hidden on this tab and deliberately ignored here —
  // one window, same basis as the official Cost & Usage view, no divergence.
  const billingPeriod = useBillingPeriod();
  const timeRange = billingPeriod.range;
  const detailQ  = useDql<BillingDetailRow>(useMemo(() => billingDetailByTypeQuery(timeRange), [timeRange]));

  // Fixed trailing-30-day query — the basis for the run-rate projections, so
  // they don't shift when the viewing timeframe changes. When the selected
  // timeframe IS 30d, the session query cache dedups this (no extra scan).
  const projDetailQ = useDql<BillingDetailRow>(useMemo(() => billingDetailByTypeQuery(PROJECTION_RANGE), []));

  const loading    = rateCard.isLoading || detailQ.isLoading;
  const queryError = detailQ.error ?? null;

  // ── End-to-end cost: consumption × environment rate card ──────────────────────
  const breakdown = useMemo(
    () => computeCost((detailQ.data as BillingDetailRow[]) ?? [], rateCard.ratesByName, timeRange.hours),
    [detailQ.data, rateCard.ratesByName, timeRange.hours],
  );

  // Run-rate projection: real cost over the last 30 days, normalized to a month.
  const projBreakdown = useMemo(
    () => computeCost((projDetailQ.data as BillingDetailRow[]) ?? [], rateCard.ratesByName, PROJECTION_RANGE.hours),
    [projDetailQ.data, rateCard.ratesByName],
  );

  const periodCost  = breakdown.totalCost;
  const monthlyCost = projBreakdown.totalCost * (HOURS_PER_MONTH / PROJECTION_RANGE.hours);
  const annualCost  = monthlyCost * 12;
  const projLoading = rateCard.isLoading || projDetailQ.isLoading;

  // ── Cost over time + 30d-vs-previous-30d comparison ───────────────────────────
  // All read dt.system.events (~0 GB scan) — no added consumption for the tab.
  // Deltas deliberately use a 30d basis (like Account Management's "Last 0-30
  // days" column): the billing-period-to-date vs its preceding window crosses
  // the previous contract cycle and produces misleading growth percentages.
  const trendQ      = useDql<BillingTrendRow>(useMemo(() => billingCostTrendQuery(timeRange), [timeRange]));
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

  // ── OFFICIAL per-capability costs (Subscription API — same source as AM) ────
  // When exposed, cards/table/KPIs show these verbatim (exact AM match) and the
  // Grail×rate-card estimation remains only for trends, quantities & drill-down.
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

  // "new" floor: a delta vs a period with < R$1 of cost is noise (+9,820,264%).
  const deltaOrNew = (cur: number | undefined, prev: number | undefined): { pct: number | null; isNew: boolean } => {
    const c = cur ?? 0;
    const p = prev ?? 0;
    if (p <= 1) return { pct: null, isNew: c > 1 };
    return { pct: ((c - p) / p) * 100, isNew: false };
  };

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

  // ── Budget (annual commitment) — mirrors Account Management ────────────────
  const budget = rateCard.officialBudget;
  const budgetUsedPct = budget && rateCard.officialCost
    ? (rateCard.officialCost.total / budget.commitment) * 100
    : null;
  const budgetDaysLeft = useMemo(() => {
    if (!budget?.periodEnd) return null;
    const end = new Date(`${budget.periodEnd}T00:00:00Z`).getTime();
    if (!isFinite(end)) return null;
    return Math.max(0, Math.round((end - Date.now()) / 86_400_000));
  }, [budget?.periodEnd]);
  // Estimated date the cumulative billing-period cost crossed the commitment.
  const commitmentReached = useMemo(() => {
    if (!budget || trend.total.length === 0) return null;
    let acc = 0;
    for (const p of trend.total) {
      acc += p.cost;
      if (acc >= budget.commitment) return new Date(p.timestamp).toISOString().slice(0, 10);
    }
    return null;
  }, [budget, trend.total]);

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
  const selectedRow    = selectedIdx >= 0 ? breakdown.rows[selectedIdx] : null;
  const selectedSeries = useMemo(
    () => (selectedCap ? trend.byCapability.get(selectedCap) ?? [] : []),
    [selectedCap, trend.byCapability],
  );

  // ── Cards ⇄ table view + CSV export (mirrors Account Management's table) ────
  const [capView, setCapView] = useState<"cards" | "table">("cards");
  const tableRows = useMemo(
    () => breakdown.rows.filter((r) => !r.unmatched).map((r) => {
      const o = officialFor(r.capability);
      const cost = o ? o.periodTotal : r.cost;
      const c30 = o?.last30 ?? last30ByCap.get(r.capability);
      const d = deltaOrNew(c30 ?? undefined, (o?.prev30 ?? prev30ByCap.get(r.capability)) ?? undefined);
      const totalForShare = hasOfficialCaps && rateCard.officialCost ? rateCard.officialCost.total : periodCost;
      const share = totalForShare > 0 ? (cost / totalForShare) * 100 : 0;
      return {
        capability: r.capability,
        period_fmt: money(cost),
        last30_fmt: c30 !== undefined && c30 !== null ? money(c30) : "—",
        delta_fmt: d.isNew ? t("delta.new") : fmtDelta(d.pct),
        share_fmt: `${fmtNum(share, 1)}%`,
      };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [breakdown.rows, last30ByCap, prev30ByCap, periodCost, money, t, rateCard.officialByCap, rateCard.officialCost, hasOfficialCaps],
  );
  const tableColumns = useMemo(
    () => [
      { header: "Capability",                accessor: "capability" },
      { header: "Billing period",            accessor: "period_fmt" },
      { header: t("billing.last30"),         accessor: "last30_fmt" },
      { header: `Δ ${t("billing.delta30")}`, accessor: "delta_fmt"  },
      { header: "% of total",                accessor: "share_fmt"  },
    ],
    [t],
  );
  const exportCsv = () => {
    const header = "capability,billing_period_cost,last_30d_cost,delta_30d_pct,share_pct";
    const lines = breakdown.rows.filter((r) => !r.unmatched).map((r) => {
      const o = officialFor(r.capability);
      const cost = o ? o.periodTotal : r.cost;
      const c30 = (o?.last30 ?? last30ByCap.get(r.capability)) ?? 0;
      const d = deltaOrNew(c30, (o?.prev30 ?? prev30ByCap.get(r.capability)) ?? undefined);
      const totalForShare = hasOfficialCaps && rateCard.officialCost ? rateCard.officialCost.total : periodCost;
      const share = totalForShare > 0 ? (cost / totalForShare) * 100 : 0;
      return `"${r.capability.replace(/"/g, '""')}",${cost.toFixed(2)},${c30.toFixed(2)},${d.isNew ? "new" : d.pct !== null ? d.pct.toFixed(1) : ""},${share.toFixed(1)}`;
    });
    const blob = new Blob([`${header}\n${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cost-by-capability.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── Honest per-capability cost display ────────────────────────────────────────
  const costCell = (row: typeof breakdown.rows[number]) => {
    if (row.unmatched) return "—";
    if (row.quantity === 0) return "—";
    if (row.cost < 0.005) return `< ${money(0.01)}`;
    return money(row.cost);
  };
  const subCell = (row: typeof breakdown.rows[number]) => {
    if (row.unmatched) return "no rate card match";
    if (row.quantity === 0) return "no billable usage this period";
    return `${fmtNum(row.quantity, 2)} ${row.unitLabel} · ${unitPrice(row.pricePerUnit)}/${row.unitLabel.replace(/s$/, "")}`;
  };
  const zeroUsageCount = breakdown.rows.filter(r => !r.unmatched && r.quantity === 0).length;

  // ── Cost Center app self-cost estimate ─────────────────────────────────────
  // Priced from Log Management & Analytics – Query rate (rate card already
  // fetched above via `useRateCard`). The rate card entry's `price` field is
  // ALREADY normalized to "USD per single GiB scanned" (buildRates in
  // useRateCard doesn't divide by any bulk factor — `price = Number(c.price)`
  // straight from the API). So the annual formula is a plain multiplication:
  //   annual = GiB_per_session × sessions_per_day × 365 × price_per_GiB
  const logQueryRate = rateCard.ratesByName.get(normalizeCapabilityName("Log Management & Analytics - Query"));
  const perGibScanPrice = logQueryRate?.price ?? 0.0035;
  const singleUserAnnualCost = APP_GIB_SCANNED_PER_SESSION * APP_SESSIONS_PER_DAY * 365 * perGibScanPrice;
  const teamAnnualCost       = singleUserAnnualCost * 10;

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

      {/* ── How to capture the account rate card ─────────────────────────────── */}
      <Surface
        elevation="flat"
        color={rateCard.source === "account" ? "success" : "warning"}
        style={{
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          // Force the tint explicitly — Surface's `color` prop alone renders
          // a subtle tint that reads as neutral on this Strato build. Setting
          // the border + a light background makes the state unmistakable.
          background: rateCard.source === "account"
            ? Colors.Background.Field.Success.Default
            : Colors.Background.Field.Warning.Default,
          border: `1px solid ${rateCard.source === "account"
            ? Colors.Border.Success.Default
            : Colors.Border.Warning.Default}`,
        }}
      >
        <Flex justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={8}>
          <Heading level={5} style={{ margin: 0 }}>
            {rateCard.source === "account"
              ? "Using your account rate card ✓"
              : "Use your real contract prices (account rate card)"}
          </Heading>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
            Currently: <strong>{rateCard.source === "account" ? "Account rate card" : "Default rate card"}</strong>
          </Text>
        </Flex>

        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
          To price consumption with your contracted rate card, the app authenticates to the Dynatrace
          Account Management API using an OAuth client. Follow these steps:
        </Text>

        <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
          <li>
            <Text textStyle="small">
              Open <a href={ACCOUNT_MGMT_URL} target="_blank" rel="noreferrer" style={{ color: Colors.Text.Primary.Default }}>myaccount.dynatrace.com</a> →
              <strong> Identity &amp; access management → OAuth clients → Create client</strong>, and grant the
              permission <strong>Account UAC read</strong> (<code>account-uac-read</code>).
            </Text>
          </li>
          <li>
            <Text textStyle="small">
              Copy the <strong>Client ID</strong> (starts with <code>dt0s02.</code>) and the
              <strong> Client Secret</strong> (shown only once).
            </Text>
          </li>
          <li>
            <Text textStyle="small">
              Find your <strong>Account UUID</strong> in the myaccount URL (<code>account/&lt;UUID&gt;</code>) or under
              <strong> Account settings</strong>.
            </Text>
          </li>
          <li>
            <Text textStyle="small">
              Open <strong>Configure rate card</strong>, set <strong>Rate Card Source = Account Rate Card</strong>,
              paste Account ID / Client ID / Client Secret, and save.
            </Text>
          </li>
        </ol>

      </Surface>

      {/* ── Cost summary ─────────────────────────────────────────────────────── */}
      <Flex flexDirection="column" gap={8}>
        <Heading level={3}>Estimated Cost</Heading>
        <Flex gap={12} flexWrap="wrap">
          <KpiCard
            label={billingPeriod.aligned ? "Cost (billing period)" : `Cost (last ${fmtHours(timeRange.hours)})`}
            value={loading ? "…" : money(hasOfficialCaps && rateCard.officialCost ? rateCard.officialCost.total : periodCost)}
            subLabel={
              hasOfficialCaps
                ? `${billingPeriod.periodFrom ?? ""} → today · Subscription API (= Account Management)`
                : (billingPeriod.aligned ? `${billingPeriod.periodFrom} → today · all capabilities` : "fixed 30d window · all capabilities") +
                  (reconPct !== null ? ` · ≈ ${reconPct > 0 ? "+" : ""}${fmtNum(reconPct, 1)}% ${t("billing.vsOfficial")}` : "")
            }
            isLoading={loading}
            error={queryError}
          />
          <KpiCard label="Monthly projection"  value={projLoading ? "…" : money(monthlyCost)} subLabel="run-rate · based on last 30 days" isLoading={projLoading} error={projDetailQ.error} colorVariant="positive" info={projectionInfo(t, "monthly")} />
          <KpiCard label="Annual projection"   value={projLoading ? "…" : money(annualCost)}  subLabel="run-rate · monthly × 12"          isLoading={projLoading} error={projDetailQ.error} colorVariant="warning"  info={projectionInfo(t, "annual")} />
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
              info={officialCostInfo(t, rateCard.officialCost)}
            />
          )}
        </Flex>
        {rateCard.officialCost && (
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
            {hasOfficialCaps
              ? t("billing.officialCaps")
              : <>
                  {t("billing.officialNote", { window: fmtHours(timeRange.hours) })}
                  {reconPct !== null ? ` ${t("billing.recon", { pct: `${reconPct > 0 ? "+" : ""}${fmtNum(reconPct, 1)}%` })}` : ""}
                </>}
          </Text>
        )}
      </Flex>

      {/* ── Budget summary (annual commitment) — mirrors Account Management ─── */}
      {budget && (
        <Surface
          elevation="flat"
          color={budgetUsedPct !== null && budgetUsedPct >= 100 ? "critical" : "primary"}
          style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}
        >
          <Flex justifyContent="space-between" alignItems="baseline" flexWrap="wrap" gap={8}>
            <Heading level={4} style={{ margin: 0 }}>{t("budget.title")}</Heading>
            {budget.periodStart && budget.periodEnd && (
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
                {t("budget.periodLabel")}: {budget.periodStart} → {budget.periodEnd}
              </Text>
            )}
          </Flex>
          <Grid gridTemplateColumns="repeat(auto-fit, minmax(190px, 1fr))" gap={12}>
            <KpiCard label={t("budget.commitment")} value={money(budget.commitment)} subLabel={budget.source === "settings" ? t("budget.sourceSettings") : "Subscription API"} />
            <KpiCard
              label={t("budget.used")}
              value={budgetUsedPct !== null ? `${fmtNum(budgetUsedPct, 1)}%` : "—"}
              subLabel={rateCard.officialCost ? `${money(rateCard.officialCost.total)} / ${money(budget.commitment)}` : ""}
              colorVariant={budgetUsedPct !== null && budgetUsedPct >= 100 ? "critical" : budgetUsedPct !== null && budgetUsedPct >= 80 ? "warning" : "positive"}
            />
            {budgetDaysLeft !== null && (
              <KpiCard label={t("budget.daysLeft")} value={String(budgetDaysLeft)} subLabel={budget.periodEnd ?? ""} />
            )}
            <KpiCard
              label={commitmentReached ? t("budget.reachedOn", { date: commitmentReached }) : t("budget.notReached")}
              value={budgetUsedPct !== null && budgetUsedPct >= 100 ? "⚠" : "✓"}
              colorVariant={budgetUsedPct !== null && budgetUsedPct >= 100 ? "critical" : "positive"}
            />
          </Grid>
          {budgetUsedPct !== null && (
            <div style={{ height: 10, borderRadius: 5, background: "var(--dt-color-border-neutral-subtle)", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.min(budgetUsedPct, 100)}%`,
                background: budgetUsedPct >= 100 ? Colors.Border.Critical.Default : budgetUsedPct >= 80 ? Colors.Border.Warning.Default : Colors.Border.Success.Default,
                borderRadius: 5,
              }} />
            </div>
          )}
          {budgetUsedPct !== null && budgetUsedPct >= 100 && (
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>{t("budget.overText")}</Text>
          )}
        </Surface>
      )}

      <Divider />

      {/* ── Cost over time + previous-period comparison ──────────────────────── */}
      <Flex flexDirection="column" gap={12}>
        <Flex justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={12}>
          <Flex flexDirection="column" gap={4}>
            <Heading level={3}>{t("billing.trend.title")}</Heading>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, maxWidth: 680 }}>
              {t("billing.trend.subtitle", { bin: timeRange.binInterval })}
            </Text>
          </Flex>
          <KpiCard
            label={t("billing.delta30")}
            value={trendLoading ? "…" : totalDelta.isNew ? t("delta.new") : fmtDelta(totalDelta.pct)}
            subLabel={
              trendLoading
                ? ""
                : totalDelta.pct !== null
                  ? t("billing.trend.deltaSub", { prev: money(totalPrev30Display) })
                  : t("billing.trend.noPrev")
            }
            isLoading={trendLoading}
            error={prevDetailQ.error}
            colorVariant={totalDelta.pct !== null && totalDelta.pct > 0.5 ? "warning" : "positive"}
          />
        </Flex>
        <ConsumptionChart
          title={`${t("billing.trend.title")} — ${fmtHours(timeRange.hours)}`}
          series={totalCostSeries}
          unit={rateCard.officialCost?.currency || rateCard.currency}
          isLoading={trendLoading}
          error={trendQ.error}
          height={220}
        />
        {/* Why "ingest down but cost flat" happens — the client's exact question. */}
        <Surface elevation="flat" color="primary" style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
          <Heading level={6} style={{ margin: 0 }}>{t("billing.why.title")}</Heading>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, lineHeight: 1.5 }}>{t("billing.why.p1")}</Text>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, lineHeight: 1.5 }}>{t("billing.why.p2")}</Text>
        </Surface>
      </Flex>

      <Divider />

      {/* ── Cost per capability ──────────────────────────────────────────────── */}
      <Flex flexDirection="column" gap={12}>
        <Flex justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={8}>
          <Heading level={3}>Cost by Capability</Heading>
          <Flex gap={8}>
            <Button variant={capView === "cards" ? "emphasized" : "default"} onClick={() => setCapView("cards")}>{t("billing.view.cards")}</Button>
            <Button variant={capView === "table" ? "emphasized" : "default"} onClick={() => setCapView("table")}>{t("billing.view.table")}</Button>
            <Button variant="default" onClick={exportCsv}>{t("billing.exportCsv")}</Button>
          </Flex>
        </Flex>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
          {t("billing.cards.hint")}
        </Text>
        {capView === "table" && (
          <DataTable data={tableRows} columns={tableColumns} sortable resizable />
        )}
        {capView === "cards" && (
        <Grid gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))" gap={12}>
          {(loading ? [] : breakdown.rows).map((row, idx) => {
            const color = chartColor(idx);
            const official = officialFor(row.capability);
            const dispCost = official ? official.periodTotal : row.cost;
            const clickable = (!row.unmatched && row.quantity > 0) || (official !== undefined && official.periodTotal > 0);
            const cost30 = official?.last30 ?? last30ByCap.get(row.capability);
            const prev30v = official?.prev30 ?? prev30ByCap.get(row.capability);
            const capDelta = clickable ? deltaOrNew(cost30 ?? undefined, prev30v ?? undefined) : { pct: null, isNew: false };
            const totalForShare = hasOfficialCaps && rateCard.officialCost ? rateCard.officialCost.total : periodCost;
            const pct = totalForShare > 0 ? (dispCost / totalForShare) * 100 : 0;
            return (
              <div
                key={row.capability}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => setSelectedCap(row.capability) : undefined}
                onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") setSelectedCap(row.capability); } : undefined}
                style={{ cursor: clickable ? "pointer" : "default", display: "flex" }}
              >
                <Surface
                  elevation="raised"
                  style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px", position: "relative", overflow: "hidden", flex: 1 }}
                >
                  <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: row.unmatched ? Colors.Text.Neutral.Subdued : color }} />
                  <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Subdued, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {row.capability}
                  </Text>
                  <Flex justifyContent="space-between" alignItems="baseline" gap={8}>
                    <Heading level={3} style={{ margin: 0 }}>
                      {official ? money(dispCost) : costCell(row)}
                    </Heading>
                    {(capDelta.pct !== null || capDelta.isNew) && (
                      <Text
                        textStyle="small-emphasized"
                        title={t("billing.delta30")}
                        style={{ color: capDelta.isNew || (capDelta.pct !== null && capDelta.pct > 0.5) ? Colors.Text.Warning.Default : capDelta.pct !== null && capDelta.pct < -0.5 ? Colors.Text.Success.Default : Colors.Text.Neutral.Subdued }}
                      >
                        {capDelta.isNew ? t("delta.new") : fmtDelta(capDelta.pct)}
                      </Text>
                    )}
                  </Flex>
                  {clickable && cost30 !== undefined && cost30 !== null && (
                    <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
                      {t("billing.last30")}: <strong>{money(cost30)}</strong>
                    </Text>
                  )}
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
                    {subCell(row)}
                  </Text>
                  {!row.unmatched && row.quantity > 0 && (
                    <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, lineHeight: 1.4 }}>
                      {descriptionFor(row.capability, lang)}
                    </Text>
                  )}
                  {!row.unmatched && row.quantity > 0 && <ProgressBar pct={pct} color={color} />}
                  {!row.unmatched && row.quantity > 0 && (
                    <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>{fmtNum(pct, 1)}% of total cost</Text>
                  )}
                </Surface>
              </div>
            );
          })}
          {loading && <Text>Loading…</Text>}
        </Grid>
        )}
      </Flex>

      {(zeroUsageCount > 0 || breakdown.unmatchedCount > 0) && !loading && (
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, maxWidth: 760 }}>
          Capabilities marked <strong>"—"</strong> have billing events but no billable quantity (GiB, GiB-hours or
          host-hours) reported in this period — typical of trial/sprint environments or capabilities measured in
          units not exposed here. Values under {money(0.01)} are shown as "&lt; {money(0.01)}".
        </Text>
      )}

      <Divider />

      {/* ── Footer: safeguard note (left) + app self-cost estimate (right) ─── */}
      <Grid gridTemplateColumns="repeat(auto-fit, minmax(340px, 1fr))" gap={16}>
        {/* Safeguard note — explains the ~1% vs Dynatrace Official Cost and the
            app's purpose. Kept short & explicit to cover us against being read
            as an authoritative invoice. */}
        <Surface
          elevation="flat"
          color="primary"
          style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}
        >
          <Heading level={5} style={{ margin: 0 }}>{t("billing.disclaimerTitle")}</Heading>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, lineHeight: 1.55 }}>
            {t("billing.disclaimer")}
          </Text>
          {rateCard.officialCostDiag && (
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, fontSize: 10 }}>
              Subscription API: {rateCard.officialCostDiag}
            </Text>
          )}
        </Surface>

        {/* App self-cost — rough estimate of what running Cost Center itself
            costs (Grail query scan × Log Query rate). */}
        <Surface
          elevation="flat"
          color="primary"
          style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}
        >
          <Heading level={5} style={{ margin: 0 }}>{t("billing.appCostTitle")}</Heading>
          <Flex flexDirection="column" gap={6}>
            <Flex justifyContent="space-between" alignItems="baseline" gap={8}>
              <Text textStyle="base-emphasized" style={{ color: Colors.Text.Neutral.Default }}>
                {rateCard.isLoading ? "…" : money(singleUserAnnualCost)}
                <span style={{ color: Colors.Text.Neutral.Subdued, fontWeight: 400, marginLeft: 4 }}>
                  {t("billing.appCostPerYear")}
                </span>
              </Text>
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
                {t("billing.appCostSingle")}
              </Text>
            </Flex>
            <Flex justifyContent="space-between" alignItems="baseline" gap={8}>
              <Text textStyle="base-emphasized" style={{ color: Colors.Text.Neutral.Default }}>
                {rateCard.isLoading ? "…" : money(teamAnnualCost)}
                <span style={{ color: Colors.Text.Neutral.Subdued, fontWeight: 400, marginLeft: 4 }}>
                  {t("billing.appCostPerYear")}
                </span>
              </Text>
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
                {t("billing.appCostTeam")}
              </Text>
            </Flex>
          </Flex>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, fontSize: 11, lineHeight: 1.45 }}>
            {t("billing.appCostNote")}
          </Text>
          <Text
            textStyle="small"
            style={{
              color: rateCard.source === "account" ? Colors.Text.Success.Default : Colors.Text.Warning.Default,
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1.45,
            }}
          >
            {rateCard.source === "account"
              ? t("billing.appCostSourceAccount")
              : t("billing.appCostSourceDefault")}
          </Text>
        </Surface>
      </Grid>

      {/* ── Per-capability drill-down (Cloud-tab pattern) ─────────────────────
          Purely presentational — reuses the trend + prev-window data already
          fetched above, so opening it costs zero additional Grail scan. */}
      <CapabilityDetailSheet
        capability={selectedRow
          ? { ...selectedRow, cost: officialFor(selectedRow.capability)?.periodTotal ?? selectedRow.cost }
          : null}
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
