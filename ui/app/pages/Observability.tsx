import React, { useMemo } from "react";
import { Flex, Grid, Divider } from "@dynatrace/strato-components/layouts";
import { Heading } from "@dynatrace/strato-components/typography";
import { MeterbarIcon } from "@dynatrace/strato-icons";
import { KpiCard } from "../components/KpiCard";
import { ConsumptionChart } from "../components/ConsumptionChart";
import { PageHeader } from "../components/PageHeader";
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
  logsCountQuery,
  logIngestGibHourlyQuery,
  spansCountQuery,
  tracesQueryGibQuery,
  eventsCountQuery,
  bizeventsCountQuery,
  topLogSourcesQuery,
  topSpanOpsQuery,
  topEventKindsQuery,
  topBizTypesQuery,
} from "../queries";
import { chartColor } from "../constants/palette";
import { CapabilityCostPanel } from "../components/CapabilityCostPanel";
import { tabIncludes } from "../constants/capabilityInfo";
import { useCapabilityCosts } from "../hooks/useCapabilityCosts";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { kpiInfo } from "../i18n/kpiInfo";
import type { TimeRangeOption } from "../types";

interface ObservabilityProps {
  timeRange: TimeRangeOption;
}

const consumptionIcon = <MeterbarIcon style={{ width: 16, height: 16 }} />;

const fmtGib = (v: number) =>
  v >= 1024 ? `${(v / 1024).toFixed(2)} TiB` : v >= 1 ? `${v.toFixed(2)} GiB` : `${(v * 1024).toFixed(1)} MiB`;

const toRows = (data: Record<string, unknown>[] | null): ContributorRow[] =>
  (data ?? []).map((r) => ({ name: String(r.name ?? "(unspecified)"), value: Number(r.value ?? 0) }));

export const Observability: React.FC<ObservabilityProps> = ({ timeRange }) => {
  // Volume series
  const logsCountQ = useDql(useMemo(() => logsCountQuery(timeRange),          [timeRange]));
  const logGibQ    = useDql(useMemo(() => logIngestGibHourlyQuery(timeRange), [timeRange]));
  const spansQ     = useDql(useMemo(() => spansCountQuery(timeRange),         [timeRange]));
  const tracesQryQ = useDql(useMemo(() => tracesQueryGibQuery(timeRange),     [timeRange]));
  const eventsQ    = useDql(useMemo(() => eventsCountQuery(timeRange),        [timeRange]));
  const bizQ       = useDql(useMemo(() => bizeventsCountQuery(timeRange),     [timeRange]));

  // Top contributors (biggest offenders)
  const topLogsQ   = useDql(useMemo(() => topLogSourcesQuery(timeRange), [timeRange]));
  const topSpansQ  = useDql(useMemo(() => topSpanOpsQuery(timeRange),    [timeRange]));
  const topEventsQ = useDql(useMemo(() => topEventKindsQuery(timeRange), [timeRange]));
  const topBizQ    = useDql(useMemo(() => topBizTypesQuery(timeRange),   [timeRange]));

  // Billing cost per capability group
  const costs = useCapabilityCosts(timeRange);
  const { money } = useCurrency();
  const { t } = useLang();
  const logCost   = costs.costForPrefix("Log Management");
  const traceCost = costs.costForPrefix("Traces");
  const eventCost = costs.costForPrefix("Events");
  const shareCost = (total: number) => (sharePct: number) => money((total * sharePct) / 100);

  const logsCountSeries = useMemo(() => toChartSeries(logsCountQ.data, "interval", "count"), [logsCountQ.data]);
  const logGibSeries    = useMemo(() => toChartSeries(logGibQ.data,    "interval", "val"),   [logGibQ.data]);
  const spansSeries     = useMemo(() => toChartSeries(spansQ.data,     "interval", "count"), [spansQ.data]);
  const tracesQrySeries = useMemo(() => toChartSeries(tracesQryQ.data, "interval", "val"),   [tracesQryQ.data]);
  const eventsSeries    = useMemo(() => toChartSeries(eventsQ.data,    "interval", "count"), [eventsQ.data]);
  const bizSeries       = useMemo(() => toChartSeries(bizQ.data,       "interval", "count"), [bizQ.data]);

  const totalLogs   = seriesTotal(logsCountSeries);
  const totalLogGib = seriesTotal(logGibSeries);
  const totalSpans  = seriesTotal(spansSeries);
  const totalTrace  = seriesTotal(tracesQrySeries);
  const totalEvents = seriesTotal(eventsSeries);
  const totalBiz    = seriesTotal(bizSeries);

  const H = timeRange.hours;

  return (
    <Flex flexDirection="column" gap={24} padding={24}>
      <PageHeader
        title="Observability"
        subtitle={`Ingest & query consumption over the last ${H}h, with the biggest ingestion contributors per signal.`}
      />

      {/* ════════ LOG MANAGEMENT ════════ */}
      <Heading level={3}>Log Management</Heading>
      <Flex gap={12} flexWrap="wrap">
        <KpiCard label="Log Records" value={formatCount(totalLogs)} subLabel={`${formatRatePerHour(perHour(totalLogs, H), "rec")}/h`} isLoading={logsCountQ.isLoading} error={logsCountQ.error} icon={consumptionIcon} info={kpiInfo(t, "logRecords")} />
        <KpiCard label="Log Ingest Volume" value={fmtGib(totalLogGib)} subLabel={`${fmtGib(perHour(totalLogGib, H))}/h`} isLoading={logGibQ.isLoading} error={logGibQ.error} colorVariant="positive" icon={consumptionIcon} info={kpiInfo(t, "logIngestVolume")} />
        <KpiCard label="Log Billing Cost" value={costs.isLoading ? "…" : money(logCost)} subLabel={`last ${H}h · ingest+query+retain`} isLoading={costs.isLoading} error={costs.error} colorVariant="critical" icon={consumptionIcon} info={kpiInfo(t, "logBillingCost")} />
      </Flex>
      <Grid gridTemplateColumns="repeat(auto-fit, minmax(420px, 1fr))" gap={16}>
        <ConsumptionChart title="Log Records Ingested" series={logsCountSeries} unit="records" isLoading={logsCountQ.isLoading} error={logsCountQ.error} color={chartColor(0)} />
        <TopContributors title="Top Log Sources (24h)" unit="cost" color={chartColor(0)} rows={toRows(topLogsQ.data)} isLoading={topLogsQ.isLoading} error={topLogsQ.error} truncateStart sectionCost={costs.isLoading ? undefined : money(logCost)} costForShare={shareCost(logCost)} />
      </Grid>

      <Divider />

      {/* ════════ DISTRIBUTED TRACING ════════ */}
      <Heading level={3}>Distributed Tracing</Heading>
      <Flex gap={12} flexWrap="wrap">
        <KpiCard label="Spans Ingested" value={formatCount(totalSpans)} subLabel={`${formatRatePerHour(perHour(totalSpans, H), "spans")}/h`} isLoading={spansQ.isLoading} error={spansQ.error} colorVariant="warning" icon={consumptionIcon} info={kpiInfo(t, "spansIngested")} />
        <KpiCard label="Trace Query Volume" value={fmtGib(totalTrace)} subLabel={`${fmtGib(perHour(totalTrace, H))}/h`} isLoading={tracesQryQ.isLoading} error={tracesQryQ.error} icon={consumptionIcon} info={kpiInfo(t, "traceQueryVolume")} />
        <KpiCard label="Trace Billing Cost" value={costs.isLoading ? "…" : money(traceCost)} subLabel={`last ${H}h · ingest+query`} isLoading={costs.isLoading} error={costs.error} colorVariant="critical" icon={consumptionIcon} info={kpiInfo(t, "traceBillingCost")} />
      </Flex>
      <Grid gridTemplateColumns="repeat(auto-fit, minmax(420px, 1fr))" gap={16}>
        <ConsumptionChart title="Spans Ingested" series={spansSeries} unit="spans" isLoading={spansQ.isLoading} error={spansQ.error} color={chartColor(3)} />
        <TopContributors title="Top Span Operations (24h)" unit="cost" color={chartColor(3)} rows={toRows(topSpansQ.data)} isLoading={topSpansQ.isLoading} error={topSpansQ.error} sectionCost={costs.isLoading ? undefined : money(traceCost)} costForShare={shareCost(traceCost)} />
      </Grid>

      <Divider />

      {/* ════════ EVENTS ════════ */}
      <Heading level={3}>Events</Heading>
      <Flex gap={12} flexWrap="wrap">
        <KpiCard label="Events" value={formatCount(totalEvents)} subLabel={`${formatRatePerHour(perHour(totalEvents, H), "ev")}/h`} isLoading={eventsQ.isLoading} error={eventsQ.error} colorVariant="warning" icon={consumptionIcon} info={kpiInfo(t, "events")} />
        <KpiCard label="Events Billing Cost" value={costs.isLoading ? "…" : money(eventCost)} subLabel={`last ${H}h · ingest+query+retain`} isLoading={costs.isLoading} error={costs.error} colorVariant="critical" icon={consumptionIcon} info={kpiInfo(t, "eventsBillingCost")} />
      </Flex>
      <Grid gridTemplateColumns="repeat(auto-fit, minmax(420px, 1fr))" gap={16}>
        <ConsumptionChart title="Monitoring Events" series={eventsSeries} unit="events" isLoading={eventsQ.isLoading} error={eventsQ.error} color={chartColor(5)} />
        <TopContributors title="Events by Kind" unit="cost" color={chartColor(5)} rows={toRows(topEventsQ.data)} isLoading={topEventsQ.isLoading} error={topEventsQ.error} sectionCost={costs.isLoading ? undefined : money(eventCost)} costForShare={shareCost(eventCost)} />
      </Grid>

      <Divider />

      {/* ════════ BUSINESS EVENTS ════════ */}
      <Heading level={3}>Business Events</Heading>
      <Flex gap={12} flexWrap="wrap">
        <KpiCard label="Business Events" value={formatCount(totalBiz)} subLabel={`${formatRatePerHour(perHour(totalBiz, H), "biz")}/h`} isLoading={bizQ.isLoading} error={bizQ.error} colorVariant="positive" icon={consumptionIcon} info={kpiInfo(t, "businessEvents")} />
      </Flex>
      <Grid gridTemplateColumns="repeat(auto-fit, minmax(420px, 1fr))" gap={16}>
        <ConsumptionChart title="Business Events" series={bizSeries} unit="bizevents" isLoading={bizQ.isLoading} error={bizQ.error} color={chartColor(7)} />
        <TopContributors title="Top Business Event Types" unit="events" color={chartColor(7)} rows={toRows(topBizQ.data)} isLoading={topBizQ.isLoading} error={topBizQ.error} />
      </Grid>

      <Divider />
      {/* Cost attribution for the data types this tab shows (logs/traces/events). */}
      <CapabilityCostPanel include={tabIncludes("observability")} />
    </Flex>
  );
};
