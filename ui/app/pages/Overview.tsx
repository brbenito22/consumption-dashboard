import React, { useMemo } from "react";
import { Flex, Grid, Divider } from "@dynatrace/strato-components/layouts";
import { Heading } from "@dynatrace/strato-components/typography";
import { MeterbarIcon } from "@dynatrace/strato-icons";
import { KpiCard } from "../components/KpiCard";
import { ConsumptionChart } from "../components/ConsumptionChart";
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
  spansCountQuery,
  eventsCountQuery,
  bizeventsCountQuery,
  totalHostsQuery,
  totalServicesQuery,
  logsCountPrevWeekQuery,
  spansCountPrevWeekQuery,
  eventsCountPrevWeekQuery,
  bizeventsCountPrevWeekQuery,
} from "../queries";
import { PageHeader } from "../components/PageHeader";
import { chartColor } from "../constants/palette";
import { useLang } from "../context/LanguageContext";
import { kpiInfo } from "../i18n/kpiInfo";
import { CapabilityCostPanel } from "../components/CapabilityCostPanel";
import { AllocationHealthCard } from "../components/AllocationHealthCard";
import { MultiCloudFootprint } from "../components/MultiCloudFootprint";
import { WeeklyComparison, type WeeklyMetric } from "../components/WeeklyComparison";
import type { TimeRangeOption } from "../types";

interface OverviewProps {
  timeRange: TimeRangeOption;
}

const consumptionIcon = <MeterbarIcon style={{ width: 16, height: 16 }} />;

function singleTotal(data: Record<string, unknown>[] | null | undefined): number {
  if (!data || data.length === 0) return 0;
  return Number(data[0]["total"] ?? 0);
}

function firstTotalLabel(data: Record<string, unknown>[] | null | undefined): string {
  if (!data || !data[0]) return "—";
  return String((data[0] as Record<string, unknown>)["total"] ?? "—");
}

export const Overview: React.FC<OverviewProps> = ({ timeRange }) => {
  const { t } = useLang();
  // Current week
  const logsQ   = useDql(useMemo(() => logsCountQuery(timeRange),      [timeRange]));
  const spansQ  = useDql(useMemo(() => spansCountQuery(timeRange),     [timeRange]));
  const eventsQ = useDql(useMemo(() => eventsCountQuery(timeRange),    [timeRange]));
  const bizQ    = useDql(useMemo(() => bizeventsCountQuery(timeRange), [timeRange]));
  const hostsQ  = useDql(useMemo(() => totalHostsQuery(),              []));
  const svcQ    = useDql(useMemo(() => totalServicesQuery(),           []));

  // Previous week
  const logsPrevQ   = useDql(useMemo(() => logsCountPrevWeekQuery(),      []));
  const spansPrevQ  = useDql(useMemo(() => spansCountPrevWeekQuery(),     []));
  const eventsPrevQ = useDql(useMemo(() => eventsCountPrevWeekQuery(),    []));
  const bizPrevQ    = useDql(useMemo(() => bizeventsCountPrevWeekQuery(), []));

  // Chart series
  const logsSeries   = useMemo(() => toChartSeries(logsQ.data,   "interval", "count"), [logsQ.data]);
  const spansSeries  = useMemo(() => toChartSeries(spansQ.data,  "interval", "count"), [spansQ.data]);
  const eventsSeries = useMemo(() => toChartSeries(eventsQ.data, "interval", "count"), [eventsQ.data]);
  const bizSeries    = useMemo(() => toChartSeries(bizQ.data,    "interval", "count"), [bizQ.data]);

  // Totals
  const totalLogs   = seriesTotal(logsSeries);
  const totalSpans  = seriesTotal(spansSeries);
  const totalEvents = seriesTotal(eventsSeries);
  const totalBiz    = seriesTotal(bizSeries);

  const metrics: WeeklyMetric[] = [
    { label: "Log Ingest (GiB)",   current: totalLogs,   prev: singleTotal(logsPrevQ.data),   loading: logsQ.isLoading   || logsPrevQ.isLoading,   color: chartColor(0) },
    { label: "Trace Spans",        current: totalSpans,  prev: singleTotal(spansPrevQ.data),  loading: spansQ.isLoading  || spansPrevQ.isLoading,  color: chartColor(2) },
    { label: "Event Ingest (GiB)", current: totalEvents, prev: singleTotal(eventsPrevQ.data), loading: eventsQ.isLoading || eventsPrevQ.isLoading, color: chartColor(3) },
    { label: "Business Events",    current: totalBiz,    prev: singleTotal(bizPrevQ.data),    loading: bizQ.isLoading    || bizPrevQ.isLoading,    color: chartColor(5) },
  ];

  // Ingestion-rate KPI descriptors — one shape, rendered uniformly below.
  const rateKpis = [
    { label: "Log Ingest / Hour",      q: logsQ,   rate: formatRatePerHour(perHour(totalLogs, timeRange.hours), "GiB"),  sub: `${formatCount(totalLogs)} GiB total (billed)`,  variant: undefined as "positive" | "warning" | undefined, info: "logRecordsPerHour" as const },
    { label: "Trace Spans / Hour",     q: spansQ,  rate: formatRatePerHour(perHour(totalSpans, timeRange.hours), ""),    sub: `${formatCount(totalSpans)} total spans`,        variant: "positive" as const, info: "spansPerHour" as const },
    { label: "Event Ingest / Hour",    q: eventsQ, rate: formatRatePerHour(perHour(totalEvents, timeRange.hours), "GiB"), sub: `${formatCount(totalEvents)} GiB total (billed)`, variant: "warning" as const, info: "eventsPerHour" as const },
    { label: "Business Events / Hour", q: bizQ,    rate: formatRatePerHour(perHour(totalBiz, timeRange.hours), ""),      sub: `${formatCount(totalBiz)} total biz events`,     variant: "warning" as const, info: "bizPerHour" as const },
  ];

  return (
    <Flex flexDirection="column" gap={24} padding={24}>

      <PageHeader
        title="Environment Consumption Overview"
        subtitle={`Ingestion and signal volume over the last ${timeRange.hours}h, with week-over-week comparison and next-week projection.`}
      />

      {/* ══ Hourly Rate KPIs ════════════════════════════════════════════════════ */}
      <Flex flexDirection="column" gap={8}>
        <Heading level={3}>Ingestion Rate</Heading>
        <Flex gap={12} flexWrap="wrap">
          {rateKpis.map((k) => (
            <KpiCard
              key={k.label}
              label={k.label}
              value={k.q.isLoading ? "…" : k.rate}
              subLabel={k.q.isLoading ? "loading…" : k.sub}
              isLoading={k.q.isLoading}
              error={k.q.error}
              colorVariant={k.variant}
              icon={consumptionIcon}
              info={kpiInfo(t, k.info)}
            />
          ))}
          <KpiCard
            label="Monitored Hosts"
            value={hostsQ.isLoading ? "…" : firstTotalLabel(hostsQ.data)}
            subLabel={hostsQ.isLoading ? "loading…" : "Full Stack + Infrastructure"}
            isLoading={hostsQ.isLoading}
            error={hostsQ.error}
            info={kpiInfo(t, "monitoredHosts")}
          />
          <KpiCard
            label="Monitored Services"
            value={svcQ.isLoading ? "…" : firstTotalLabel(svcQ.data)}
            subLabel={svcQ.isLoading ? "loading…" : "application services"}
            isLoading={svcQ.isLoading}
            error={svcQ.error}
            colorVariant="positive"
            info={kpiInfo(t, "monitoredServices")}
          />
          {/* Cost-allocation coverage — reuses dt.system.events (~0 GB). */}
          <AllocationHealthCard />
        </Flex>
      </Flex>

      <Divider />

      {/* ══ Multi-Cloud Footprint (queries reused from Cloud + Infra — 0 new scan) ═ */}
      <MultiCloudFootprint timeRange={timeRange} />

      <Divider />

      {/* ══ Weekly Comparison + Week-over-Week Summary ═════════════════════════ */}
      <WeeklyComparison metrics={metrics} />

      <Divider />

      {/* ══ Trend Charts ════════════════════════════════════════════════════════ */}
      <Heading level={3}>Ingestion Trend — Last 7 Days</Heading>
      <Grid gridTemplateColumns="repeat(auto-fit, minmax(420px, 1fr))" gap={16}>
        <ConsumptionChart title="Log Records"     series={logsSeries}   unit="records"   isLoading={logsQ.isLoading}   error={logsQ.error}   color={chartColor(0)} />
        <ConsumptionChart title="Trace Spans"     series={spansSeries}  unit="spans"     isLoading={spansQ.isLoading}  error={spansQ.error}  color={chartColor(2)} />
        <ConsumptionChart title="Events"          series={eventsSeries} unit="events"    isLoading={eventsQ.isLoading} error={eventsQ.error} color={chartColor(3)} />
        <ConsumptionChart title="Business Events" series={bizSeries}    unit="bizevents" isLoading={bizQ.isLoading}    error={bizQ.error}    color={chartColor(5)} />
      </Grid>

      <Divider />
      {/* Top capabilities by cost — the "where does the money actually go" view. */}
      <CapabilityCostPanel limit={6} />
    </Flex>
  );
};
