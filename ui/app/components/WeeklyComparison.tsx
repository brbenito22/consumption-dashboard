import React from "react";
import { Surface, Flex, Grid, Divider } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { MeterbarIcon } from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { KpiCard } from "./KpiCard";
import { formatCount } from "../hooks/useDql";
import { useLang } from "../context/LanguageContext";
import { STATUS_COLORS } from "../constants/palette";

const consumptionIcon = <MeterbarIcon style={{ width: 16, height: 16 }} />;

export interface WeeklyMetric {
  label: string;
  current: number;
  prev: number;
  loading: boolean;
  color: string;
}

function pctChange(current: number, prev: number): string {
  if (prev === 0) return current > 0 ? "New" : "—";
  const pct = ((current - prev) / prev) * 100;
  const sign = pct >= 0 ? "+" : "";
  // Compact very large swings (e.g. 2,030,696% → +2.0M%)
  if (Math.abs(pct) >= 1000) return `${sign}${formatCount(pct)}%`;
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * A drop this steep is ambiguous: it can be a real optimization, or a broken
 * ingestion pipeline. Either way it deserves a look — showing it as a green
 * "cost went down" would be the app congratulating a possible outage.
 */
const COLLAPSE_PCT = -50;

function pctDrop(current: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((current - prev) / prev) * 100;
}

function pctVariant(current: number, prev: number): "positive" | "critical" | "warning" | "default" {
  if (prev === 0) return "default";
  const drop = pctDrop(current, prev);
  if (drop !== null && drop <= COLLAPSE_PCT) return "warning";
  return current <= prev ? "positive" : "critical";
}

function nextWeekEstimate(current: number, prev: number): number {
  if (prev === 0) return current;
  const rate = (current - prev) / prev;
  // Cap growth rate at 200% to avoid unrealistic projections for new services
  const cappedRate = Math.min(Math.max(rate, -0.99), 2.0);
  // No rounding here — formatCount decides the precision. Rounding a 0.40 GiB
  // projection to "0" next to a 0.44 GiB current value reads as broken.
  return current * (1 + cappedRate);
}

const MiniBox: React.FC<{ label: string; value: string; emphasis?: boolean }> = ({ label, value, emphasis }) => (
  <Flex flexDirection="column" gap={2} style={{
    flex: "1 1 0", padding: "8px 10px", borderRadius: 6,
    background: Colors.Background.Container.Neutral.Default,
  }}>
    <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</Text>
    <Text textStyle={emphasis ? "base-emphasized" : "base"} style={{ color: Colors.Text.Neutral.Default }}>{value}</Text>
  </Flex>
);

/** One comparison card: title + change badge + previous/current/next boxes. */
const ComparisonCard: React.FC<{ m: WeeklyMetric }> = ({ m }) => {
  const { t } = useLang();
  const next  = nextWeekEstimate(m.current, m.prev);
  const isUp  = m.current > m.prev && m.prev > 0;
  const isNew = m.prev === 0 && m.current > 0;
  const drop = pctDrop(m.current, m.prev);
  const collapsed = drop !== null && drop <= COLLAPSE_PCT;
  const badgeColor = m.loading ? Colors.Text.Neutral.Subdued
    : isUp ? STATUS_COLORS.critical
    : isNew || collapsed ? STATUS_COLORS.warning
    : STATUS_COLORS.ideal;
  const badgeBg = m.loading ? Colors.Background.Field.Neutral.Default
    : isUp ? Colors.Background.Field.Critical.Default
    : isNew || collapsed ? Colors.Background.Field.Warning.Default
    : Colors.Background.Field.Success.Default;

  return (
    <Surface elevation="raised" style={{ padding: 16, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: m.color }} />
      <Flex justifyContent="space-between" alignItems="center" gap={8}>
        <Flex alignItems="center" gap={8}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
          <Text textStyle="base-emphasized" style={{ color: Colors.Text.Neutral.Default }}>{m.label}</Text>
        </Flex>
        <span style={{
          fontSize: "12px", fontWeight: 700, padding: "3px 10px", borderRadius: 12,
          color: badgeColor, background: badgeBg, whiteSpace: "nowrap",
        }}>
          {m.loading ? "…" : pctChange(m.current, m.prev)}
        </span>
      </Flex>
      <Flex gap={8} flexWrap="wrap">
        <MiniBox label="Previous"       value={m.loading ? "…" : formatCount(m.prev)} />
        <MiniBox label="This week"      value={m.loading ? "…" : formatCount(m.current)} emphasis />
        <MiniBox label="Next week est." value={m.loading ? "…" : `≈ ${formatCount(next)}`} />
      </Flex>
      {collapsed && !m.loading && (
        <Text textStyle="small" style={{ color: Colors.Text.Warning.Default, lineHeight: 1.45 }}>
          {t("weekly.collapse")}
        </Text>
      )}
    </Surface>
  );
};

/**
 * "Weekly Comparison" + "Week-over-Week Summary" sections (Overview tab):
 * this-week vs previous-week per signal, with a capped next-week projection.
 * Pure presentation — all data arrives via the metrics prop.
 */
export const WeeklyComparison: React.FC<{ metrics: WeeklyMetric[] }> = ({ metrics }) => (
  <>
    <Flex flexDirection="column" gap={8}>
      <Heading level={3}>Weekly Comparison</Heading>
      <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
        This week (last 7 days) vs previous week — with next-week projection based on the growth trend.
      </Text>
      <Grid gridTemplateColumns="repeat(auto-fit, minmax(320px, 1fr))" gap={12}>
        {metrics.map((m) => <ComparisonCard key={m.label} m={m} />)}
      </Grid>
    </Flex>

    <Divider />

    <Flex flexDirection="column" gap={8}>
      <Heading level={3}>Week-over-Week Summary</Heading>
      <Flex gap={12} flexWrap="wrap">
        {metrics.map((m) => (
          <KpiCard
            key={m.label}
            label={m.label}
            value={m.loading ? "…" : formatCount(m.current)}
            subLabel={
              m.loading
                ? "loading…"
                : `prev: ${formatCount(m.prev)}  ·  ${pctChange(m.current, m.prev)}  ·  est: ~${formatCount(nextWeekEstimate(m.current, m.prev))}`
            }
            isLoading={m.loading}
            colorVariant={m.loading ? "default" : pctVariant(m.current, m.prev)}
            icon={consumptionIcon}
          />
        ))}
      </Flex>
    </Flex>
  </>
);
