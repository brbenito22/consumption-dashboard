import React, { useMemo } from "react";
import { Flex, Divider } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { MeterbarIcon } from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { KpiCard } from "../components/KpiCard";
import { useDql, formatCount } from "../hooks/useDql";
import { useRateCard } from "../hooks/useRateCard";
import { useCostCalibration } from "../hooks/useCostCalibration";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { kpiInfo } from "../i18n/kpiInfo";
import { normalizeCapabilityName } from "../constants/rateCard";
import { PageHeader } from "../components/PageHeader";
import { CapabilityCostPanel } from "../components/CapabilityCostPanel";
import { KubernetesSection } from "../components/KubernetesSection";
import { HostInventoryTable, cloudProvider, type HostRow, type HostLicense } from "../components/HostInventoryTable";
import { tabIncludes } from "../constants/capabilityInfo";
import { fmtPct, num, singleCount } from "../utils/format";
import {
  fullStackHostCountQuery,
  infraHostCountQuery,
  totalMonitoredHostsQuery,
  hostListDetailQuery,
  hostCpuByHostQuery,
  hostMemByHostQuery,
  hostLicenseQuery,
  virtualMachineQuery,
} from "../queries";
import type { TimeRangeOption } from "../types";

interface InfrastructureProps {
  timeRange: TimeRangeOption;
}

const consumptionIcon = <MeterbarIcon style={{ width: 16, height: 16 }} />;

/** Name → value map from a `{name, <field>}` result set. */
function byName(data: unknown, field: string): Map<string, number> {
  const m = new Map<string, number>();
  ((data ?? []) as Record<string, unknown>[]).forEach((r) => m.set(String(r.name), num(r[field])));
  return m;
}

export const Infrastructure: React.FC<InfrastructureProps> = ({ timeRange }) => {
  // Entity-based counts (reliable)
  const fsCountQ    = useDql(useMemo(() => fullStackHostCountQuery(),  []));
  const infraCountQ = useDql(useMemo(() => infraHostCountQuery(),      []));
  const totalHostQ  = useDql(useMemo(() => totalMonitoredHostsQuery(), []));

  // Host inventory + per-host CPU/memory (scalar, robust)
  const hostsQ = useDql<HostRow>(useMemo(() => hostListDetailQuery(), []));
  const cpuQ   = useDql(useMemo(() => hostCpuByHostQuery(timeRange), [timeRange]));
  const memQ   = useDql(useMemo(() => hostMemByHostQuery(timeRange), [timeRange]));

  // Per-host license consumption (Full-Stack gibibyte-hours / Infra host-hours)
  const licenseQ = useDql(useMemo(() => hostLicenseQuery(timeRange), [timeRange]));
  const vmQ      = useDql(useMemo(() => virtualMachineQuery(), []));

  const rateCard = useRateCard();
  const calibration = useCostCalibration();
  const { money } = useCurrency();
  const { t } = useLang();

  const fsCount    = singleCount(fsCountQ.data    as Record<string, unknown>[], "total_fullstack_hosts");
  const infraCount = singleCount(infraCountQ.data as Record<string, unknown>[], "total_infra_hosts");
  const totalHosts = singleCount(totalHostQ.data  as Record<string, unknown>[], "total");
  const vmCount    = singleCount(vmQ.data         as Record<string, unknown>[], "count");

  // CPU/mem maps by host name
  const cpuByName = useMemo(() => byName(cpuQ.data, "avgCpu"), [cpuQ.data]);
  const memByName = useMemo(() => byName(memQ.data, "avgMem"), [memQ.data]);

  // License consumption + estimated cost per host id — rates calibrated to the
  // official Subscription-API basis so host/hostgroup/node tables sum to the
  // same capability totals the Billing tab (and Account Management) show.
  const fsRate    = (rateCard.ratesByName.get(normalizeCapabilityName("Full-Stack Monitoring"))?.price ?? 0) * calibration.factorFor("Full-Stack Monitoring");
  const infraRate = (rateCard.ratesByName.get(normalizeCapabilityName("Infrastructure Monitoring"))?.price ?? 0) * calibration.factorFor("Infrastructure Monitoring");
  const licenseByHost = useMemo(() => {
    const m = new Map<string, HostLicense>();
    ((licenseQ.data ?? []) as Record<string, unknown>[]).forEach((r) => {
      const gibH = num(r.gib_hours);
      const hostH = num(r.host_hours);
      m.set(String(r.host), { gibH, hostH, cost: gibH * fsRate + hostH * infraRate });
    });
    return m;
  }, [licenseQ.data, fsRate, infraRate]);

  const totalLicenseCost = useMemo(
    () => [...licenseByHost.values()].reduce((a, v) => a + v.cost, 0),
    [licenseByHost],
  );

  const hosts = (hostsQ.data ?? []) as HostRow[];
  const fleetAvgCpu = useMemo(() => {
    const vals = [...cpuByName.values()];
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [cpuByName]);

  // ── Cloud-inherited hosts (derived from the SAME hosts query — zero extra Grail cost) ───
  const cloudSummary = useMemo(() => {
    const byProvider = new Map<string, number>();
    let total = 0;
    for (const h of hosts) {
      const { short, isCloud } = cloudProvider(h.cloudType as string | undefined);
      if (!isCloud) continue;
      total++;
      byProvider.set(short, (byProvider.get(short) ?? 0) + 1);
    }
    return { total, byProvider };
  }, [hosts]);

  const cloudSubLabel = cloudSummary.total === 0
    ? "no cloud hosts detected"
    : [...cloudSummary.byProvider.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([p, c]) => `${c} ${p}`)
        .join(" · ");

  return (
    <Flex flexDirection="column" gap={24} padding={24}>

      <PageHeader
        title="Infrastructure & K8s"
        subtitle={`Monitored hosts, license consumption and Kubernetes footprint over the last ${timeRange.hours}h.`}
      />

      {/* ══ Host Monitoring ═════════════════════════════════════════════════════ */}
      <Flex flexDirection="column" gap={8}>
        <Heading level={3}>Host Monitoring</Heading>
        <Flex gap={12} flexWrap="wrap">
          <KpiCard label="Total Monitored Hosts" value={totalHostQ.isLoading ? "…" : formatCount(totalHosts)} subLabel="Full Stack + Infrastructure" isLoading={totalHostQ.isLoading} error={totalHostQ.error} icon={consumptionIcon} info={kpiInfo(t, "totalHosts")} />
          <KpiCard label="Full Stack Monitoring"  value={fsCountQ.isLoading ? "…" : formatCount(fsCount)}     subLabel="hosts with Full Stack agent"  isLoading={fsCountQ.isLoading} error={fsCountQ.error} icon={consumptionIcon} info={kpiInfo(t, "fullStackHosts")} />
          <KpiCard label="Infrastructure Monitoring" value={infraCountQ.isLoading ? "…" : formatCount(infraCount)} subLabel="hosts with Infrastructure agent" isLoading={infraCountQ.isLoading} error={infraCountQ.error} colorVariant="positive" icon={consumptionIcon} info={kpiInfo(t, "infraHosts")} />
          <KpiCard label="Fleet Avg CPU" value={cpuQ.isLoading ? "…" : fmtPct(fleetAvgCpu)} subLabel={`avg CPU usage · ${cpuByName.size} host(s) reporting · last ${timeRange.hours}h`} isLoading={cpuQ.isLoading} error={cpuQ.error} colorVariant="warning" icon={consumptionIcon} info={kpiInfo(t, "fleetCpu")} />
          <KpiCard label="Host License Cost" value={licenseQ.isLoading || rateCard.isLoading ? "…" : money(totalLicenseCost)} subLabel={`${rateCard.source === "account" ? "account" : "default"} rate · last ${timeRange.hours}h`} isLoading={licenseQ.isLoading || rateCard.isLoading} error={licenseQ.error} colorVariant="critical" icon={consumptionIcon} info={kpiInfo(t, "hostLicenseCost")} />
          {vmCount > 0 && (
            <KpiCard label="Virtual Machines" value={formatCount(vmCount)} subLabel="hypervisor VMs" isLoading={vmQ.isLoading} error={vmQ.error} info={kpiInfo(t, "virtualMachines")} />
          )}
          <KpiCard
            label="Cloud-Inherited Hosts"
            value={hostsQ.isLoading ? "…" : formatCount(cloudSummary.total)}
            subLabel={cloudSubLabel}
            isLoading={hostsQ.isLoading}
            error={hostsQ.error}
            colorVariant="positive"
            icon={consumptionIcon}
          />
        </Flex>
      </Flex>

      <Divider />

      {/* ══ Host Inventory table ═════════════════════════════════════════════════ */}
      <Flex flexDirection="column" gap={8}>
        <Heading level={3}>Host Inventory</Heading>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
          License consumption per host from billing usage events (Full-Stack gibibyte-hours / Infrastructure host-hours),
          priced with the {rateCard.source === "account" ? "account" : "default"} rate card. Window: last {timeRange.hours}h.
          The <strong>Cloud</strong> column shows hosts inherited from a cloud provider (OneAgent installed on EC2 / Azure VM / GCE); the
          <strong> Mode</strong> column shows how each is being monitored (Full-Stack, Infrastructure, …). The same license quantity
          also drives the per-tile drill-down on the Cloud tab (not double-billed).
        </Text>
        <HostInventoryTable
          hosts={hosts}
          isLoading={hostsQ.isLoading}
          error={hostsQ.error}
          cpuByName={cpuByName}
          memByName={memByName}
          licenseByHost={licenseByHost}
          cloudTotal={cloudSummary.total}
        />
      </Flex>

      <Divider />

      {/* ══ Kubernetes ══════════════════════════════════════════════════════════ */}
      <KubernetesSection timeRange={timeRange} />

      <Divider />
      {/* Cost attribution for host/K8s capabilities (Full-Stack, Infra, K8s…). */}
      <CapabilityCostPanel include={tabIncludes("infrastructure")} />
    </Flex>
  );
};
