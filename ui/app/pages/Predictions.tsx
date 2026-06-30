import React, { useMemo } from "react";
import { Surface, Flex, Grid, Divider } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { KpiCard } from "../components/KpiCard";
import { PageHeader } from "../components/PageHeader";
import { useDql } from "../hooks/useDql";
import { useRateCard } from "../hooks/useRateCard";
import { useCurrency } from "../context/CurrencyContext";
import { chartColor, STATUS_COLORS } from "../constants/palette";
import { normalizeCapabilityName } from "../constants/rateCard";
import { billingDailyTrendQuery, billingBaselineQuery } from "../queries";

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtGib = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} PiB`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(2)} TiB`;
  if (v >= 1)         return `${v.toFixed(2)} GiB`;
  return `${(v * 1024).toFixed(1)} MiB`;
};
const fmtGibH = (v: number) =>
  v >= 1_000 ? `${(v / 1_000).toFixed(1)}K GiB·h` : `${v.toFixed(0)} GiB·h`;

const fmtNum = (v: number, d = 1) =>
  !isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

// ── Linear regression ─────────────────────────────────────────────────────────
function linearRegression(ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };
  const xs = Array.from({ length: n }, (_, i) => i);
  const meanX = (n - 1) / 2;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  const ssXX  = xs.reduce((acc, x) => acc + (x - meanX) ** 2, 0);
  const ssXY  = xs.reduce((acc, x, i) => acc + (x - meanX) * (ys[i] - meanY), 0);
  const ssYY  = ys.reduce((acc, y) => acc + (y - meanY) ** 2, 0);
  const slope     = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;
  const r2        = ssYY === 0 ? 1 : Math.max(0, 1 - ys.reduce((acc, y, i) => {
    const pred = slope * xs[i] + intercept;
    return acc + (y - pred) ** 2;
  }, 0) / ssYY);
  return { slope, intercept, r2 };
}

/** Predict total GiB for the next N days using the regression from the last `days` data points. */
function predictNext(dailyValues: number[], nextDays: number): number {
  if (dailyValues.length === 0) return 0;
  const { slope, intercept } = linearRegression(dailyValues);
  const n = dailyValues.length;
  let total = 0;
  for (let i = 0; i < nextDays; i++) {
    total += Math.max(0, slope * (n + i) + intercept);
  }
  return total;
}

// ── Capability config — maps event.type to display name + colour ──────────────
const CAP_CONFIG: Record<string, { label: string; color: string; unit: "gib" | "gib_hours" }> = {
  "Log Management & Analytics - Retain":          { label: "Log Retain",    color: chartColor(0), unit: "gib" },
  "Log Management & Analytics - Ingest & Process":{ label: "Log Ingest",    color: chartColor(1), unit: "gib" },
  "Log Management & Analytics - Query":           { label: "Log Query",     color: chartColor(2), unit: "gib" },
  "Traces - Ingest & Process":                    { label: "Traces Ingest", color: chartColor(3), unit: "gib" },
  "Traces - Query":                               { label: "Traces Query",  color: chartColor(4), unit: "gib" },
  "Events - Retain":                              { label: "Events Retain", color: chartColor(5), unit: "gib" },
  "Events - Ingest & Process":                    { label: "Events Ingest", color: chartColor(6), unit: "gib" },
  "Events - Query":                               { label: "Events Query",  color: chartColor(7), unit: "gib" },
  "Full-Stack Monitoring":                        { label: "Full-Stack",    color: chartColor(8), unit: "gib_hours" },
  "Digital Experience Monitoring - Query":        { label: "DEM Query",     color: chartColor(9), unit: "gib" },
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface TrendRow { day: string; capability: string; data_gib: number; gib_hours: number; }
interface BaselineRow { capability: string; data_gib: number; gib_hours: number; event_count: number; }

interface CapPrediction {
  key: string;
  label: string;
  color: string;
  unit: "gib" | "gib_hours";
  dailyAvg7d: number;
  trend7d:   number;    // slope × 7
  pred7d:    number;
  pred14d:   number;
  pred30d:   number;
  r2:        number;
  trendDir:  "up" | "down" | "flat";
}

// ── Component ─────────────────────────────────────────────────────────────────
export const Predictions: React.FC = () => {
  const trendQ    = useDql<TrendRow>(useMemo(() => billingDailyTrendQuery(), []));
  const baselineQ = useDql<BaselineRow>(useMemo(() => billingBaselineQuery(), []));
  const rateCard  = useRateCard();
  const { money: fmtUSD } = useCurrency();

  const loading = trendQ.isLoading || baselineQ.isLoading || rateCard.isLoading;
  const err     = trendQ.error || baselineQ.error || null;

  // ── Group daily rows by capability ─────────────────────────────────────────
  const predictions = useMemo<CapPrediction[]>(() => {
    const rows    = (trendQ.data ?? []) as TrendRow[];
    const baseMap = new Map<string, BaselineRow>();
    ((baselineQ.data ?? []) as BaselineRow[]).forEach(r => baseMap.set(r.capability, r));

    const byCapability = new Map<string, number[]>();
    const byCapabilityGibH = new Map<string, number[]>();

    // Sort rows by day to ensure chronological order
    const sorted = [...rows].sort((a, b) =>
      new Date(a.day).getTime() - new Date(b.day).getTime()
    );

    for (const row of sorted) {
      if (!byCapability.has(row.capability)) {
        byCapability.set(row.capability, []);
        byCapabilityGibH.set(row.capability, []);
      }
      byCapability.get(row.capability)!.push(Number(row.data_gib) || 0);
      byCapabilityGibH.get(row.capability)!.push(Number(row.gib_hours) || 0);
    }

    const results: CapPrediction[] = [];

    for (const [cap, config] of Object.entries(CAP_CONFIG)) {
      const isGibH  = config.unit === "gib_hours";
      const dailySeries = isGibH
        ? (byCapabilityGibH.get(cap) ?? [])
        : (byCapability.get(cap) ?? []);

      if (dailySeries.length === 0) continue;

      const { slope, r2 } = linearRegression(dailySeries);
      const last7 = dailySeries.slice(-7);
      const dailyAvg7d = last7.reduce((a, b) => a + b, 0) / (last7.length || 1);

      const pred7d  = predictNext(dailySeries, 7);
      const pred14d = predictNext(dailySeries, 14);
      const pred30d = predictNext(dailySeries, 30);

      const trendDir: "up" | "down" | "flat" =
        slope > dailyAvg7d * 0.02 ? "up" :
        slope < -dailyAvg7d * 0.02 ? "down" : "flat";

      results.push({
        key: cap,
        label: config.label,
        color: config.color,
        unit: config.unit,
        dailyAvg7d,
        trend7d: slope * 7,
        pred7d,
        pred14d,
        pred30d,
        r2,
        trendDir,
      });
    }

    return results.sort((a, b) => b.pred30d - a.pred30d);
  }, [trendQ.data, baselineQ.data]);

  // ── Totals (GiB-only caps) ─────────────────────────────────────────────────
  const gibPreds = predictions.filter(p => p.unit === "gib");
  const totalPred7d  = gibPreds.reduce((a, p) => a + p.pred7d,  0);
  const totalPred14d = gibPreds.reduce((a, p) => a + p.pred14d, 0);
  const totalPred30d = gibPreds.reduce((a, p) => a + p.pred30d, 0);

  const fsEntry = predictions.find(p => p.unit === "gib_hours");

  // ── Projected cost (predicted quantity × environment rate card) ─────────────
  const projectedCost = useMemo(() => {
    const cost = (days: "pred7d" | "pred14d" | "pred30d") =>
      predictions.reduce((acc, p) => {
        const rate = rateCard.ratesByName.get(normalizeCapabilityName(p.key));
        return acc + (rate ? p[days] * rate.price : 0);
      }, 0);
    return { c7: cost("pred7d"), c14: cost("pred14d"), c30: cost("pred30d") };
  }, [predictions, rateCard.ratesByName]);

  const trendIcon = (d: "up" | "down" | "flat") =>
    d === "up" ? "↑" : d === "down" ? "↓" : "→";

  const fmtUnit = (p: CapPrediction, val: number) =>
    p.unit === "gib_hours" ? fmtGibH(val) : fmtGib(val);

  return (
    <Flex flexDirection="column" gap={24} padding={24}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Consumption Predictions"
        subtitle="Linear regression on 30 days of billing usage events — projected consumption and cost for the next 7, 14 and 30 days."
      />

      {/* ── Total GiB projections ──────────────────────────────────────────── */}
      <Flex flexDirection="column" gap={8}>
        <Heading level={3}>Total GiB Projection (all GiB capabilities)</Heading>
        <Flex gap={12} flexWrap="wrap">
          <KpiCard
            label="Next 7 days"
            value={loading ? "…" : fmtGib(totalPred7d)}
            subLabel="projected ingest + retain + query"
            isLoading={loading} error={err}
            colorVariant="positive"
          />
          <KpiCard
            label="Next 14 days"
            value={loading ? "…" : fmtGib(totalPred14d)}
            subLabel="projected ingest + retain + query"
            isLoading={loading} error={err}
            colorVariant="warning"
          />
          <KpiCard
            label="Next 30 days"
            value={loading ? "…" : fmtGib(totalPred30d)}
            subLabel="projected ingest + retain + query"
            isLoading={loading} error={err}
          />
          {fsEntry && (
            <KpiCard
              label="Full-Stack next 30d"
              value={loading ? "…" : fmtGibH(fsEntry.pred30d)}
              subLabel="GiB-hours (memory-gibibyte-hours)"
              isLoading={loading} error={err}
            />
          )}
        </Flex>
      </Flex>

      <Divider />

      {/* ── Projected cost ─────────────────────────────────────────────────── */}
      <Flex flexDirection="column" gap={8}>
        <Heading level={3}>
          Projected Cost ({rateCard.source === "account" ? "Account rate card" : "Default rate card"})
        </Heading>
        <Flex gap={12} flexWrap="wrap">
          <KpiCard label="Cost next 7 days"  value={loading ? "…" : fmtUSD(projectedCost.c7)}  subLabel="predicted consumption × price" isLoading={loading} error={err} colorVariant="positive" />
          <KpiCard label="Cost next 14 days" value={loading ? "…" : fmtUSD(projectedCost.c14)} subLabel="predicted consumption × price" isLoading={loading} error={err} colorVariant="warning" />
          <KpiCard label="Cost next 30 days" value={loading ? "…" : fmtUSD(projectedCost.c30)} subLabel="≈ next-month projection"       isLoading={loading} error={err} />
        </Flex>
      </Flex>

      <Divider />

      {/* ── Per-capability predictions ─────────────────────────────────────── */}
      <Heading level={3}>Prediction by Capability</Heading>
      <Grid gridTemplateColumns="repeat(auto-fit, minmax(280px, 1fr))" gap={16}>
        {(loading ? Array.from({ length: 6 }) : predictions).map((p, idx) => {
          if (loading) {
            return (
              <Surface key={idx} elevation="raised" style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
                <Text>Loading…</Text>
              </Surface>
            );
          }
          const pred = p as CapPrediction;
          return (
            <Surface key={pred.key} elevation="raised"
              style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16, position: "relative", overflow: "hidden" }}>
              <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: pred.color }} />

              {/* Title row */}
              <Flex justifyContent="space-between" alignItems="center">
                <Text style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--dt-color-text-subdued)" }}>
                  {pred.label}
                </Text>
                <Text style={{ fontSize: "13px", fontWeight: 700, color: pred.trendDir === "up" ? STATUS_COLORS.critical : pred.trendDir === "down" ? STATUS_COLORS.ideal : STATUS_COLORS.neutral }}>
                  {trendIcon(pred.trendDir)}
                </Text>
              </Flex>

              {/* Daily avg */}
              <Flex flexDirection="column" gap={2}>
                <Text style={{ fontSize: "11px", color: "var(--dt-color-text-subdued)" }}>7-day daily avg</Text>
                <Text style={{ fontSize: "16px", fontWeight: 600 }}>{fmtUnit(pred, pred.dailyAvg7d)}</Text>
              </Flex>

              {/* Projections */}
              <Flex gap={8} flexWrap="wrap">
                <Flex flexDirection="column" gap={2} style={{ minWidth: 72 }}>
                  <Text style={{ fontSize: "10px", color: "var(--dt-color-text-subdued)" }}>+7 days</Text>
                  <Text style={{ fontSize: "13px", fontWeight: 600 }}>{fmtUnit(pred, pred.pred7d)}</Text>
                </Flex>
                <Flex flexDirection="column" gap={2} style={{ minWidth: 72 }}>
                  <Text style={{ fontSize: "10px", color: "var(--dt-color-text-subdued)" }}>+14 days</Text>
                  <Text style={{ fontSize: "13px", fontWeight: 600 }}>{fmtUnit(pred, pred.pred14d)}</Text>
                </Flex>
                <Flex flexDirection="column" gap={2} style={{ minWidth: 72 }}>
                  <Text style={{ fontSize: "10px", color: "var(--dt-color-text-subdued)" }}>+30 days</Text>
                  <Text style={{ fontSize: "13px", fontWeight: 600 }}>{fmtUnit(pred, pred.pred30d)}</Text>
                </Flex>
              </Flex>

              {/* R² indicator */}
              <Flex justifyContent="space-between" alignItems="center">
                <Text style={{ fontSize: "10px", color: "var(--dt-color-text-subdued)" }}>
                  Model fit R² = {fmtNum(pred.r2 * 100, 0)}%
                </Text>
                <Text style={{ fontSize: "10px", color: "var(--dt-color-text-subdued)" }}>
                  slope {pred.trendDir !== "flat" ? `${pred.trendDir === "up" ? "+" : ""}${fmtNum(pred.trend7d, 1)} ${pred.unit === "gib" ? "GiB" : "GiB·h"}/7d` : "stable"}
                </Text>
              </Flex>

              {/* Trend bar */}
              <div style={{ height: 4, borderRadius: 2, background: "var(--dt-color-border-neutral-subtle)", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(100, Math.max(2, pred.r2 * 100))}%`,
                  background: pred.color,
                  borderRadius: 2,
                  transition: "width 0.4s ease",
                }} />
              </div>
            </Surface>
          );
        })}
      </Grid>

      <Divider />

      {/* ── Methodology note ──────────────────────────────────────────────────── */}
      <Flex flexDirection="column" gap={6}>
        <Heading level={4}>Methodology</Heading>
        <Text style={{ fontSize: "12px", color: "var(--dt-color-text-subdued)", maxWidth: 720 }}>
          Each capability's daily consumption for the past 30 days is fit with Ordinary Least Squares (OLS) linear regression.
          The slope determines whether consumption is trending up (↑), down (↓), or stable (→).
          R² measures how well the linear model fits the data — values above 70% indicate a reliable trend.
          Predictions assume the current trend continues; sudden environment changes will affect accuracy.
          Full-Stack Monitoring is measured in <strong>GiB-hours</strong> (memory-gibibyte-hours) as reported by Dynatrace billing, not in flat GiB.
        </Text>
      </Flex>

    </Flex>
  );
};
