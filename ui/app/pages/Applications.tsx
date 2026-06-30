import React, { useMemo } from "react";
import { Flex, Grid, Divider } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { MeterbarIcon } from "@dynatrace/strato-icons";
import { KpiCard } from "../components/KpiCard";
import { ConsumptionChart } from "../components/ConsumptionChart";
import { TopContributors, type ContributorRow } from "../components/TopContributors";
import {
  useDql,
  toChartSeries,
  seriesTotal,
  formatCount,
  perHour,
  formatRatePerHour,
} from "../hooks/useDql";
import {
  rumActivityQuery,
  syntheticActivityQuery,
  appEngineActivityQuery,
  topEndpointsQuery,
  topAppOpsQuery,
} from "../queries";
import { PageHeader } from "../components/PageHeader";
import { chartColor } from "../constants/palette";
import { useCapabilityCosts } from "../hooks/useCapabilityCosts";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { kpiInfo } from "../i18n/kpiInfo";
import type { TimeRangeOption } from "../types";

const toRows = (data: Record<string, unknown>[] | null): ContributorRow[] =>
  (data ?? []).map((r) => ({ name: String(r.name ?? "(unspecified)"), value: Number(r.value ?? 0) }));

interface ApplicationsProps {
  timeRange: TimeRangeOption;
}

const consumptionIcon = <MeterbarIcon style={{ width: 16, height: 16 }} />;

export const Applications: React.FC<ApplicationsProps> = ({ timeRange }) => {
  // Sourced from dt.system.events (BILLING_USAGE_EVENT) — the builtin:billing.*
  // metrics are empty in trial/sprint tenants.
  const rumQ       = useDql(useMemo(() => rumActivityQuery(timeRange),       [timeRange]));
  const syntheticQ = useDql(useMemo(() => syntheticActivityQuery(timeRange), [timeRange]));
  const appEngineQ = useDql(useMemo(() => appEngineActivityQuery(timeRange), [timeRange]));
  const topEndpointsQ = useDql(useMemo(() => topEndpointsQuery(timeRange), [timeRange]));
  const topOpsQ       = useDql(useMemo(() => topAppOpsQuery(timeRange),    [timeRange]));

  const costs = useCapabilityCosts(timeRange);
  const { money } = useCurrency();
  const { t } = useLang();
  const traceCost  = costs.costForPrefix("Traces");
  const rumCost    = costs.costForPrefix("Real User Monitoring");
  const synthCost  = costs.costForPrefix("Browser Monitor");
  const appEngCost = costs.costForPrefix("AppEngine Functions");
  const shareCost = (total: number) => (sharePct: number) => money((total * sharePct) / 100);

  const rumSeries       = useMemo(() => toChartSeries(rumQ.data,       "interval", "val"), [rumQ.data]);
  const syntheticSeries = useMemo(() => toChartSeries(syntheticQ.data, "interval", "val"), [syntheticQ.data]);
  const appEngineSeries = useMemo(() => toChartSeries(appEngineQ.data, "interval", "val"), [appEngineQ.data]);

  const totalRum       = seriesTotal(rumSeries);
  const totalSynthetic = seriesTotal(syntheticSeries);
  const totalDdu       = seriesTotal(appEngineSeries);

  const rumPerH   = perHour(totalRum,       timeRange.hours);
  const synthPerH = perHour(totalSynthetic, timeRange.hours);
  const dduPerH   = perHour(totalDdu,       timeRange.hours);

  return (
    <Flex flexDirection="column" gap={24} padding={24}>

      {/* ── Header ── */}
      <PageHeader
        title="Applications"
        subtitle={`RUM, Synthetic and AppEngine billing activity over the last ${timeRange.hours}h, from billing usage events.`}
      />

      {/* ── Activity Rate Summary ── */}
      <Flex flexDirection="column" gap={8}>
        <Heading level={3}>Billing Activity Rate</Heading>
        <Flex gap={12} flexWrap="wrap">
          <KpiCard
            label="RUM events/h"
            value={formatRatePerHour(rumPerH, "events")}
            subLabel={`${formatCount(totalRum)} billing events`}
            isLoading={rumQ.isLoading}
            error={rumQ.error}
            icon={consumptionIcon}
          />
          <KpiCard
            label="Synthetic events/h"
            value={formatRatePerHour(synthPerH, "events")}
            subLabel={`${formatCount(totalSynthetic)} billing events`}
            isLoading={syntheticQ.isLoading}
            error={syntheticQ.error}
            colorVariant="positive"
            icon={consumptionIcon}
          />
          <KpiCard
            label="AppEngine events/h"
            value={formatRatePerHour(dduPerH, "events")}
            subLabel={`${formatCount(totalDdu)} billing events`}
            isLoading={appEngineQ.isLoading}
            error={appEngineQ.error}
            colorVariant="warning"
            icon={consumptionIcon}
          />
        </Flex>
      </Flex>

      {/* ── Estimated Billing Cost ── */}
      <Flex flexDirection="column" gap={8}>
        <Heading level={3}>Estimated Billing Cost</Heading>
        <Flex gap={12} flexWrap="wrap">
          <KpiCard label="RUM Cost"        value={costs.isLoading ? "…" : money(rumCost)}    subLabel="Real User Monitoring (sessions)"   isLoading={costs.isLoading} error={costs.error} colorVariant="critical" info={kpiInfo(t, "rumCost")} />
          <KpiCard label="Synthetic Cost"  value={costs.isLoading ? "…" : money(synthCost)}  subLabel="Browser Monitor (actions)"         isLoading={costs.isLoading} error={costs.error} colorVariant="critical" info={kpiInfo(t, "syntheticCost")} />
          <KpiCard label="AppEngine Cost"  value={costs.isLoading ? "…" : money(appEngCost)} subLabel="Functions (invocations)"           isLoading={costs.isLoading} error={costs.error} colorVariant="critical" info={kpiInfo(t, "appEngineCost")} />
        </Flex>
      </Flex>

      <Divider />

      {/* ── RUM ── */}
      <Heading level={3}>Real User Monitoring</Heading>
      <Grid gridTemplateColumns="repeat(auto-fit, minmax(420px, 1fr))" gap={16}>
        <ConsumptionChart
          title="RUM Billing Events"
          series={rumSeries}
          unit="events"
          isLoading={rumQ.isLoading}
          error={rumQ.error}
          color={chartColor(0)}
        />
      </Grid>

      <Divider />

      {/* ── Synthetic ── */}
      <Heading level={3}>Synthetic Monitoring</Heading>
      <Grid gridTemplateColumns="repeat(auto-fit, minmax(420px, 1fr))" gap={16}>
        <ConsumptionChart
          title="Browser Monitor / Clickpath Events"
          series={syntheticSeries}
          unit="events"
          isLoading={syntheticQ.isLoading}
          error={syntheticQ.error}
          color={chartColor(2)}
        />
      </Grid>

      <Divider />

      {/* ── AppEngine ── */}
      <Heading level={3}>AppEngine Functions</Heading>
      <Grid gridTemplateColumns="repeat(auto-fit, minmax(420px, 1fr))" gap={16}>
        <ConsumptionChart
          title="AppEngine Function Events"
          series={appEngineSeries}
          unit="events"
          isLoading={appEngineQ.isLoading}
          error={appEngineQ.error}
          color={chartColor(3)}
        />
      </Grid>

      <Divider />

      {/* ── Top application traffic (biggest offenders) ── */}
      <Heading level={3}>Top Application Traffic</Heading>
      <Flex gap={12} flexWrap="wrap">
        <KpiCard label="Trace Billing Cost" value={costs.isLoading ? "…" : money(traceCost)} subLabel={`last ${timeRange.hours}h · ingest+query`} isLoading={costs.isLoading} error={costs.error} colorVariant="critical" icon={consumptionIcon} info={kpiInfo(t, "traceBillingCost")} />
      </Flex>
      <Grid gridTemplateColumns="repeat(auto-fit, minmax(420px, 1fr))" gap={16}>
        <TopContributors title="Top Endpoints (24h)" unit="cost" color={chartColor(0)} rows={toRows(topEndpointsQ.data)} isLoading={topEndpointsQ.isLoading} error={topEndpointsQ.error} sectionCost={costs.isLoading ? undefined : money(traceCost)} costForShare={shareCost(traceCost)} />
        <TopContributors title="Top Operations (24h)" unit="cost" color={chartColor(5)} rows={toRows(topOpsQ.data)} isLoading={topOpsQ.isLoading} error={topOpsQ.error} sectionCost={costs.isLoading ? undefined : money(traceCost)} costForShare={shareCost(traceCost)} />
      </Grid>
    </Flex>
  );
};
