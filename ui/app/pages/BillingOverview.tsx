import React, { useMemo } from "react";
import { Surface, Flex, Grid, Divider } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { SettingIcon } from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { KpiCard } from "../components/KpiCard";
import { PageHeader } from "../components/PageHeader";
import { useDql } from "../hooks/useDql";
import { useRateCard } from "../hooks/useRateCard";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { computeCost, type BillingDetailRow } from "../utils/costEngine";
import { billingDetailByTypeQuery } from "../queries";
import { rateCardSettingsUrl } from "../utils/settingsLink";
import { chartColor } from "../constants/palette";
import { normalizeCapabilityName } from "../constants/rateCard";
import { TIME_RANGE_OPTIONS, type TimeRangeOption } from "../types";

// ── Cost Center app self-cost estimate constants ────────────────────────────
// Rough GiB scanned per full user session across all tabs the app renders
// (Overview + Applications + Observability + Billing + Predictions + Cloud +
// Infrastructure). Anchored on the fact that the heavy queries are the raw
// `fetch logs` / `fetch spans` calls, which dominate the scan budget. This is
// intentionally rough — the point is to show an order of magnitude.
const APP_GIB_SCANNED_PER_SESSION = 30;
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

export const BillingOverview: React.FC<BillingOverviewProps> = ({ timeRange }) => {
  const { money, unitPrice } = useCurrency();
  const { t } = useLang();

  const rateCard = useRateCard();
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
  // fetched above via `useRateCard`). Rate card exposes `price` normalized to
  // "USD per unit of `quotedUnitOfMeasure`", and Query is quoted "per 1M GiB
  // scanned" → single-GiB price = rate.price / 1_000_000.
  const logQueryRate = rateCard.ratesByName.get(normalizeCapabilityName("Log Management & Analytics - Query"));
  const perGibScanPrice = logQueryRate ? logQueryRate.price / 1_000_000 : 0.0035 / 1_000_000;
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
        color={rateCard.source === "account" ? "success" : "primary"}
        style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}
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
          <KpiCard label={`Cost (last ${fmtHours(timeRange.hours)})`} value={loading ? "…" : money(periodCost)} subLabel="selected timeframe · all capabilities" isLoading={loading} error={queryError} />
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
            {t("billing.officialNote", { window: fmtHours(timeRange.hours) })}
          </Text>
        )}
      </Flex>

      <Divider />

      {/* ── Cost per capability ──────────────────────────────────────────────── */}
      <Flex flexDirection="column" gap={12}>
        <Heading level={3}>Cost by Capability</Heading>
        <Grid gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))" gap={12}>
          {(loading ? [] : breakdown.rows).map((row, idx) => {
            const pct = periodCost > 0 ? (row.cost / periodCost) * 100 : 0;
            const color = chartColor(idx);
            return (
              <Surface
                key={row.capability}
                elevation="raised"
                style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px", position: "relative", overflow: "hidden" }}
              >
                <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: row.unmatched ? Colors.Text.Neutral.Subdued : color }} />
                <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Subdued, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {row.capability}
                </Text>
                <Heading level={3} style={{ margin: 0 }}>
                  {costCell(row)}
                </Heading>
                <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
                  {subCell(row)}
                </Text>
                {!row.unmatched && row.quantity > 0 && <ProgressBar pct={pct} color={color} />}
                {!row.unmatched && row.quantity > 0 && (
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>{fmtNum(pct, 1)}% of total cost</Text>
                )}
              </Surface>
            );
          })}
          {loading && <Text>Loading…</Text>}
        </Grid>
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
              </Text>
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
                {t("billing.appCostSingle")}
              </Text>
            </Flex>
            <Flex justifyContent="space-between" alignItems="baseline" gap={8}>
              <Text textStyle="base-emphasized" style={{ color: Colors.Text.Neutral.Default }}>
                {rateCard.isLoading ? "…" : money(teamAnnualCost)}
              </Text>
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
                {t("billing.appCostTeam")}
              </Text>
            </Flex>
          </Flex>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, fontSize: 11, lineHeight: 1.45 }}>
            {t("billing.appCostNote")}
          </Text>
        </Surface>
      </Grid>
    </Flex>
  );
};
