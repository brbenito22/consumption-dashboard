import React, { useMemo } from "react";
import { Surface, Flex, Grid, Divider } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { MeterbarIcon } from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";
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
  // Cloud & Cloud metrics — reused from Cloud tab so `useDql`'s session
  // cache dedupes identical query strings across tabs (0 extra Grail scan
  // when either tab is visited within the 120s TTL).
  awsInventoryQuery,
  azureInventoryQuery,
  gcpInventoryQuery,
  gcpProjectsCountQuery,
  metricsDpsBillingQuery,
  // Host list — reused from Infrastructure tab; the same fetch produces
  // the cloud-inherited host breakdown here (client-side aggregation).
  hostListDetailQuery,
} from "../queries";
import { useRateCard } from "../hooks/useRateCard";
import { useCostCalibration } from "../hooks/useCostCalibration";
import { useCurrency } from "../context/CurrencyContext";
import { normalizeCapabilityName } from "../constants/rateCard";
import { PageHeader } from "../components/PageHeader";
import { chartColor, STATUS_COLORS } from "../constants/palette";
import { useLang } from "../context/LanguageContext";
import { kpiInfo } from "../i18n/kpiInfo";
import { CapabilityCostPanel } from "../components/CapabilityCostPanel";
import type { TimeRangeOption } from "../types";

interface OverviewProps {
  timeRange: TimeRangeOption;
}

const consumptionIcon = <MeterbarIcon style={{ width: 16, height: 16 }} />;

function pctChange(current: number, prev: number): string {
  if (prev === 0) return current > 0 ? "New" : "—";
  const pct = ((current - prev) / prev) * 100;
  const sign = pct >= 0 ? "+" : "";
  // Compact very large swings (e.g. 2,030,696% → +2.0M%)
  if (Math.abs(pct) >= 1000) return `${sign}${formatCount(pct)}%`;
  return `${sign}${pct.toFixed(1)}%`;
}

function pctVariant(current: number, prev: number): "positive" | "critical" | "default" {
  if (prev === 0) return "default";
  return current <= prev ? "positive" : "critical";
}

function nextWeekEstimate(current: number, prev: number): number {
  if (prev === 0) return current;
  const rate = (current - prev) / prev;
  // Cap growth rate at 200% to avoid unrealistic projections for new services
  const cappedRate = Math.min(Math.max(rate, -0.99), 2.0);
  return Math.round(current * (1 + cappedRate));
}

function singleTotal(data: Record<string, unknown>[] | null | undefined): number {
  if (!data || data.length === 0) return 0;
  return Number(data[0]["total"] ?? 0);
}

/** Sum of `count` across inventory rows (`{svc, count}`). */
function sumInventoryCount(data: Record<string, unknown>[] | null | undefined): number {
  if (!data) return 0;
  return data.reduce((s, r) => s + Number((r as Record<string, unknown>)["count"] ?? 0), 0);
}

function singleField(data: Record<string, unknown>[] | null | undefined, field: string): number {
  if (!data || data.length === 0) return 0;
  return Number((data[0] as Record<string, unknown>)[field] ?? 0);
}

/** Map a host's raw `cloudType` value to a short badge label + whether it counts as cloud. */
function cloudTypeShort(cloudType: unknown): { short: string; isCloud: boolean } {
  const raw = (cloudType ?? "").toString();
  switch (raw) {
    case "EC2":                    return { short: "AWS",   isCloud: true  };
    case "AZURE":                  return { short: "Azure", isCloud: true  };
    case "GOOGLE_CLOUD_PLATFORM":  return { short: "GCP",   isCloud: true  };
    case "OTHER":                  return { short: "cloud", isCloud: true  };
    case "":                       return { short: "on-prem", isCloud: false };
    default:                       return { short: raw,     isCloud: true  };
  }
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

  // ── Multi-Cloud Footprint (queries reused from Cloud + Infra — 0 new scan) ─────
  const awsInvQ     = useDql(useMemo(() => awsInventoryQuery(),   []));
  const azureInvQ   = useDql(useMemo(() => azureInventoryQuery(), []));
  const gcpInvQ     = useDql(useMemo(() => gcpInventoryQuery(),   []));
  const gcpPrjQ     = useDql(useMemo(() => gcpProjectsCountQuery(), []));
  const dpsQ        = useDql(useMemo(() => metricsDpsBillingQuery(timeRange), [timeRange]));
  const hostsDetailQ = useDql(useMemo(() => hostListDetailQuery(), []));

  const rateCard = useRateCard();
  const calibration = useCostCalibration();
  const { money } = useCurrency();

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

  const prevLogs   = singleTotal(logsPrevQ.data   as Record<string, unknown>[]);
  const prevSpans  = singleTotal(spansPrevQ.data  as Record<string, unknown>[]);
  const prevEvents = singleTotal(eventsPrevQ.data as Record<string, unknown>[]);
  const prevBiz    = singleTotal(bizPrevQ.data    as Record<string, unknown>[]);

  const logsPerH   = perHour(totalLogs,   timeRange.hours);
  const spansPerH  = perHour(totalSpans,  timeRange.hours);
  const eventsPerH = perHour(totalEvents, timeRange.hours);
  const bizPerH    = perHour(totalBiz,    timeRange.hours);

  const totalHosts = hostsQ.data?.[0]
    ? String((hostsQ.data[0] as Record<string, unknown>)["total"] ?? "—")
    : "—";
  const totalServices = svcQ.data?.[0]
    ? String((svcQ.data[0] as Record<string, unknown>)["total"] ?? "—")
    : "—";

  const metrics = [
    { label: "Log Ingest (GiB)",   current: totalLogs,   prev: prevLogs,   loading: logsQ.isLoading   || logsPrevQ.isLoading,   color: chartColor(0) },
    { label: "Trace Spans",        current: totalSpans,  prev: prevSpans,  loading: spansQ.isLoading  || spansPrevQ.isLoading,  color: chartColor(2) },
    { label: "Event Ingest (GiB)", current: totalEvents, prev: prevEvents, loading: eventsQ.isLoading || eventsPrevQ.isLoading, color: chartColor(3) },
    { label: "Business Events",    current: totalBiz,    prev: prevBiz,    loading: bizQ.isLoading    || bizPrevQ.isLoading,    color: chartColor(5) },
  ];

  // Cloud aggregation — all client-side from queries that other tabs also run.
  const awsCloud   = sumInventoryCount(awsInvQ.data   as Record<string, unknown>[]);
  const azureCloud = sumInventoryCount(azureInvQ.data as Record<string, unknown>[]);
  const gcpCloud   = sumInventoryCount(gcpInvQ.data   as Record<string, unknown>[]);
  const totalCloudEntities = awsCloud + azureCloud + gcpCloud;
  const gcpProjects = singleField(gcpPrjQ.data as Record<string, unknown>[], "count");

  const cloudHosts = useMemo(() => {
    const byProvider = new Map<string, number>();
    let total = 0;
    for (const h of ((hostsDetailQ.data ?? []) as Record<string, unknown>[])) {
      const { short, isCloud } = cloudTypeShort((h as Record<string, unknown>)["cloudType"]);
      if (!isCloud) continue;
      total++;
      byProvider.set(short, (byProvider.get(short) ?? 0) + 1);
    }
    return { total, byProvider };
  }, [hostsDetailQ.data]);

  // DPS metrics cost — Metrics - Ingest & Process × rate card, calibrated to
  // the official Subscription-API basis (same math as Cloud tab).
  const metricsRate = rateCard.ratesByName.get(normalizeCapabilityName("Metrics - Ingest & Process"));
  const dpsDataPoints = singleField(dpsQ.data as Record<string, unknown>[], "data_points");
  const dpsCost = (metricsRate ? dpsDataPoints * metricsRate.price : 0) * calibration.factorFor("Metrics - Ingest & Process");

  const cloudIsLoading = awsInvQ.isLoading || azureInvQ.isLoading || gcpInvQ.isLoading;
  const hasAnyCloudSignal = totalCloudEntities > 0 || cloudHosts.total > 0 || gcpProjects > 0;

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
          <KpiCard
            label="Log Ingest / Hour"
            value={logsQ.isLoading ? "…" : formatRatePerHour(logsPerH, "GiB")}
            subLabel={logsQ.isLoading ? "loading…" : `${formatCount(totalLogs)} GiB total (billed)`}
            isLoading={logsQ.isLoading}
            error={logsQ.error}
            icon={consumptionIcon}
            info={kpiInfo(t, "logRecordsPerHour")}
          />
          <KpiCard
            label="Trace Spans / Hour"
            value={spansQ.isLoading ? "…" : formatRatePerHour(spansPerH, "")}
            subLabel={spansQ.isLoading ? "loading…" : `${formatCount(totalSpans)} total spans`}
            isLoading={spansQ.isLoading}
            error={spansQ.error}
            colorVariant="positive"
            icon={consumptionIcon}
            info={kpiInfo(t, "spansPerHour")}
          />
          <KpiCard
            label="Event Ingest / Hour"
            value={eventsQ.isLoading ? "…" : formatRatePerHour(eventsPerH, "GiB")}
            subLabel={eventsQ.isLoading ? "loading…" : `${formatCount(totalEvents)} GiB total (billed)`}
            isLoading={eventsQ.isLoading}
            error={eventsQ.error}
            colorVariant="warning"
            icon={consumptionIcon}
            info={kpiInfo(t, "eventsPerHour")}
          />
          <KpiCard
            label="Business Events / Hour"
            value={bizQ.isLoading ? "…" : formatRatePerHour(bizPerH, "")}
            subLabel={bizQ.isLoading ? "loading…" : `${formatCount(totalBiz)} total biz events`}
            isLoading={bizQ.isLoading}
            error={bizQ.error}
            colorVariant="warning"
            icon={consumptionIcon}
            info={kpiInfo(t, "bizPerHour")}
          />
          <KpiCard
            label="Monitored Hosts"
            value={hostsQ.isLoading ? "…" : totalHosts}
            subLabel={hostsQ.isLoading ? "loading…" : "Full Stack + Infrastructure"}
            isLoading={hostsQ.isLoading}
            error={hostsQ.error}
            info={kpiInfo(t, "monitoredHosts")}
          />
          <KpiCard
            label="Monitored Services"
            value={svcQ.isLoading ? "…" : totalServices}
            subLabel={svcQ.isLoading ? "loading…" : "application services"}
            isLoading={svcQ.isLoading}
            error={svcQ.error}
            colorVariant="positive"
            info={kpiInfo(t, "monitoredServices")}
          />
        </Flex>
      </Flex>

      <Divider />

      {/* ══ Multi-Cloud Footprint ════════════════════════════════════════════════ */}
      <Flex flexDirection="column" gap={8}>
        <Heading level={3}>Multi-Cloud Footprint</Heading>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, maxWidth: 980 }}>
          Cloud inventory (per-provider entities), OneAgent-inherited cloud hosts and DPS metrics billing —
          all surfaced here for an executive read-out. Per-tile drill-down with per-entity details and
          per-host cost lives in the Cloud tab; the Infrastructure &amp; K8s tab shows host license cost.
          {" "}These numbers reuse queries the Cloud and Infrastructure tabs already run — no extra Grail scan.
        </Text>
        <Flex gap={12} flexWrap="wrap">
          <KpiCard
            label="Total Cloud Entities"
            value={cloudIsLoading ? "…" : formatCount(totalCloudEntities)}
            subLabel="AWS + Azure + GCP inventory"
            isLoading={cloudIsLoading}
            colorVariant={hasAnyCloudSignal ? "positive" : "default"}
            icon={consumptionIcon}
          />
          <KpiCard
            label="AWS Entities"
            value={awsInvQ.isLoading ? "…" : formatCount(awsCloud)}
            subLabel="EC2 · Lambda · RDS · ELB/ALB/NLB · EBS"
            isLoading={awsInvQ.isLoading}
            error={awsInvQ.error}
            icon={consumptionIcon}
          />
          <KpiCard
            label="Azure Entities"
            value={azureInvQ.isLoading ? "…" : formatCount(azureCloud)}
            subLabel="VMs · Functions · SQL · Cosmos · Storage · Redis"
            isLoading={azureInvQ.isLoading}
            error={azureInvQ.error}
            icon={consumptionIcon}
          />
          <KpiCard
            label="GCP Entities"
            value={gcpInvQ.isLoading ? "…" : formatCount(gcpCloud)}
            subLabel={gcpProjects > 0 ? `${gcpProjects} project connected · Compute Engine · Cloud Storage · GKE · Cloud SQL` : "Compute Engine · Cloud Storage · GKE · Cloud SQL"}
            isLoading={gcpInvQ.isLoading}
            error={gcpInvQ.error}
            icon={consumptionIcon}
          />
          <KpiCard
            label="Cloud-Inherited Hosts"
            value={hostsDetailQ.isLoading ? "…" : formatCount(cloudHosts.total)}
            subLabel={
              cloudHosts.total === 0
                ? "no cloud OneAgent hosts detected"
                : [...cloudHosts.byProvider.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([p, c]) => `${c} ${p}`)
                    .join(" · ")
            }
            isLoading={hostsDetailQ.isLoading}
            error={hostsDetailQ.error}
            colorVariant="positive"
            icon={consumptionIcon}
          />
          <KpiCard
            label="Cloud Metrics Cost (window)"
            value={dpsQ.isLoading || rateCard.isLoading ? "…" : money(dpsCost)}
            subLabel={
              metricsRate
                ? `${formatCount(dpsDataPoints)} data_points · billed as "Metrics - Ingest & Process"`
                : dpsQ.isLoading ? "loading…" : `${formatCount(dpsDataPoints)} data_points · no rate matched`
            }
            isLoading={dpsQ.isLoading || rateCard.isLoading}
            error={dpsQ.error}
            colorVariant={dpsCost > 0 ? "warning" : "default"}
            icon={consumptionIcon}
          />
        </Flex>
      </Flex>

      <Divider />

      {/* ══ Weekly Comparison cards ══════════════════════════════════════════════ */}
      <Flex flexDirection="column" gap={8}>
        <Heading level={3}>Weekly Comparison</Heading>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
          This week (last 7 days) vs previous week — with next-week projection based on the growth trend.
        </Text>

        <Grid gridTemplateColumns="repeat(auto-fit, minmax(320px, 1fr))" gap={12}>
          {metrics.map((m) => {
            const next   = nextWeekEstimate(m.current, m.prev);
            const isUp   = m.current > m.prev && m.prev > 0;
            const isNew  = m.prev === 0 && m.current > 0;
            const badgeColor = m.loading ? Colors.Text.Neutral.Subdued
              : isUp ? STATUS_COLORS.critical : isNew ? STATUS_COLORS.warning : STATUS_COLORS.ideal;
            const badgeBg = m.loading ? Colors.Background.Field.Neutral.Default
              : isUp ? Colors.Background.Field.Critical.Default
              : isNew ? Colors.Background.Field.Warning.Default
              : Colors.Background.Field.Success.Default;

            const miniBox = (label: string, value: string, emphasis = false) => (
              <Flex flexDirection="column" gap={2} style={{
                flex: "1 1 0", padding: "8px 10px", borderRadius: 6,
                background: Colors.Background.Container.Neutral.Default,
              }}>
                <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</Text>
                <Text textStyle={emphasis ? "base-emphasized" : "base"} style={{ color: Colors.Text.Neutral.Default }}>{value}</Text>
              </Flex>
            );

            return (
              <Surface key={m.label} elevation="raised" style={{ padding: 16, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", gap: 12 }}>
                <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: m.color }} />
                {/* Title + change badge */}
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
                {/* Value boxes */}
                <Flex gap={8} flexWrap="wrap">
                  {miniBox("Previous", m.loading ? "…" : formatCount(m.prev))}
                  {miniBox("This week", m.loading ? "…" : formatCount(m.current), true)}
                  {miniBox("Next week est.", m.loading ? "…" : `≈ ${formatCount(next)}`)}
                </Flex>
              </Surface>
            );
          })}
        </Grid>
      </Flex>

      <Divider />

      {/* ══ Summary KPI Tiles ════════════════════════════════════════════════════ */}
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
