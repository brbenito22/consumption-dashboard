import React, { useMemo, useState } from "react";
import { Flex, Grid, Divider } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { MeterbarIcon } from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { KpiCard } from "../components/KpiCard";
import { TopContributors, type ContributorRow } from "../components/TopContributors";
import { useDql, formatCount } from "../hooks/useDql";
import { useRateCard } from "../hooks/useRateCard";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { kpiInfo } from "../i18n/kpiInfo";
import { normalizeCapabilityName } from "../constants/rateCard";
import { chartColor } from "../constants/palette";
import { PageHeader } from "../components/PageHeader";
import {
  fullStackHostCountQuery,
  infraHostCountQuery,
  totalMonitoredHostsQuery,
  hostListDetailQuery,
  hostCpuByHostQuery,
  hostMemByHostQuery,
  hostLicenseQuery,
  k8sClusterCountQuery,
  k8sNodeCountEntityQuery,
  k8sWorkloadCountQuery,
  k8sNamespaceCountQuery,
  k8sPodCountEntityQuery,
  costByHostGroupQuery,
  k8sNodeLicenseListQuery,
  k8sPodsByNamespaceQuery,
  k8sWorkloadsByNamespaceQuery,
  k8sTopWorkloadsQuery,
  virtualMachineQuery,
} from "../queries";
import type { TimeRangeOption } from "../types";

const fmtGibH = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0);

interface InfrastructureProps {
  timeRange: TimeRangeOption;
}

const num = (v: unknown): number => {
  const x = Number(v ?? 0);
  return isFinite(x) ? x : 0;
};

function singleCount(data: Record<string, unknown>[] | null | undefined, field: string): number {
  if (!data || data.length === 0) return 0;
  return num(data[0][field]);
}

const consumptionIcon = <MeterbarIcon style={{ width: 16, height: 16 }} />;

const fmtBytes = (b: number) =>
  b >= 1_073_741_824 ? `${(b / 1_073_741_824).toFixed(1)} GiB`
  : b >= 1_048_576    ? `${(b / 1_048_576).toFixed(0)} MiB`
  : `${b} B`;

const fmtPct = (v: number | undefined) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(1)}%`);

// ── Host inventory row ──────────────────────────────────────────────────────────
interface HostRow {
  id?: unknown;
  name?: unknown;
  monitoringMode?: unknown;
  osType?: unknown;
  osVersion?: unknown;
  cpuCores?: unknown;
  memoryTotal?: unknown;
  hostGroupName?: unknown;
  /**
   * Raw `dt.entity.host.cloudType`. Known values in real tenants:
   * `EC2`, `AZURE`, `GOOGLE_CLOUD_PLATFORM`, `KUBERNETES`, `OPENSHIFT`, `OTHER`.
   * `null` / missing → on-premises or non-cloud virtualization.
   */
  cloudType?: unknown;
}

/** Human-readable cloud label + short badge for the inventory table. */
function cloudProvider(cloudType: string | null | undefined): { label: string; short: string; isCloud: boolean } {
  const raw = (cloudType ?? "").toString().trim();
  if (!raw) return { label: "On-premises",     short: "on-prem", isCloud: false };
  switch (raw) {
    case "EC2":                    return { label: "AWS EC2",         short: "AWS",   isCloud: true };
    case "AZURE":                  return { label: "Azure VM",        short: "Azure", isCloud: true };
    case "GOOGLE_CLOUD_PLATFORM":  return { label: "GCP Compute Engine", short: "GCP",   isCloud: true };
    case "KUBERNETES":             return { label: "Kubernetes",      short: "K8s",   isCloud: false };
    case "OPENSHIFT":              return { label: "OpenShift",       short: "OCP",   isCloud: false };
    case "OTHER":                  return { label: "Other cloud",     short: "cloud", isCloud: true };
    default:                       return { label: raw,               short: raw,     isCloud: true };
  }
}

function cloudBadge(cloudType: string | null | undefined) {
  const { label, short, isCloud } = cloudProvider(cloudType);
  return (
    <span
      title={label}
      style={{
        fontSize: "11px",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 10,
        color:      isCloud ? Colors.Text.Primary.Default : Colors.Text.Neutral.Subdued,
        background: isCloud ? Colors.Background.Field.Primary.Emphasized : Colors.Background.Container.Neutral.Default,
      }}
    >
      {short}
    </span>
  );
}

// ── Reusable cell styles ────────────────────────────────────────────────────────
const cellBase: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: "13px",
  borderBottom: `1px solid ${Colors.Border.Neutral.Default}`,
  whiteSpace: "nowrap",
};
const headCell: React.CSSProperties = {
  ...cellBase,
  fontSize: "11px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: Colors.Text.Neutral.Subdued,
  background: Colors.Background.Container.Neutral.Default,
  position: "sticky",
  top: 0,
};

function modePill(mode: string) {
  const fullStack = mode === "FULL_STACK";
  return (
    <span style={{
      fontSize: "11px",
      fontWeight: 600,
      padding: "2px 8px",
      borderRadius: 10,
      color: fullStack ? Colors.Text.Primary.Default : Colors.Text.Success.Default,
      background: fullStack ? Colors.Background.Field.Primary.Emphasized : Colors.Background.Field.Success.Default,
    }}>
      {mode}
    </span>
  );
}

// ── Reusable cost/consumption table ─────────────────────────────────────────────
type Align = "left" | "right";
const CostTable: React.FC<{
  columns: string[];
  aligns: Align[];
  rows: string[][];
  loading?: boolean;
  error?: string | null;
  empty?: string;
}> = ({ columns, aligns, rows, loading, error, empty }) => {
  if (error) return <Text style={{ color: "var(--dt-color-text-critical)" }}>Failed to load: {error}</Text>;
  if (loading) return <Text style={{ color: "var(--dt-color-text-subdued)" }}>Loading…</Text>;
  if (rows.length === 0) return <Text style={{ color: "var(--dt-color-text-subdued)" }}>{empty ?? "No data."}</Text>;
  return (
    <div style={{ overflowX: "auto", borderRadius: 6, border: `1px solid ${Colors.Border.Neutral.Default}` }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c} style={{ ...headCell, textAlign: aligns[i] }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td key={ci} style={{
                  ...cellBase,
                  textAlign: aligns[ci],
                  fontWeight: ci === 0 || ci === r.length - 1 ? 600 : 400,
                  color: ci === 0 || ci === r.length - 1 ? Colors.Text.Neutral.Default : Colors.Text.Neutral.Subdued,
                }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

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
  const rateCard = useRateCard();
  const { money: fmtUSD } = useCurrency();
  const { t } = useLang();

  // Kubernetes (entity counts + node license cost) — cloud lives in the Cloud tab
  const k8sClustersQ = useDql(useMemo(() => k8sClusterCountQuery(), []));
  const k8sNodeQ     = useDql(useMemo(() => k8sNodeCountEntityQuery(), []));
  const k8sWlQ       = useDql(useMemo(() => k8sWorkloadCountQuery(), []));
  const k8sNsQ       = useDql(useMemo(() => k8sNamespaceCountQuery(), []));
  const k8sPodQ      = useDql(useMemo(() => k8sPodCountEntityQuery(), []));
  const groupCostQ   = useDql(useMemo(() => costByHostGroupQuery(timeRange), [timeRange]));
  const nodeListQ    = useDql(useMemo(() => k8sNodeLicenseListQuery(timeRange), [timeRange]));
  const nsPodsQ      = useDql(useMemo(() => k8sPodsByNamespaceQuery(), []));
  const nsWlQ        = useDql(useMemo(() => k8sWorkloadsByNamespaceQuery(), []));
  const topWlQ       = useDql(useMemo(() => k8sTopWorkloadsQuery(), []));
  const vmQ    = useDql(useMemo(() => virtualMachineQuery(), []));

  const fsCount    = singleCount(fsCountQ.data    as Record<string, unknown>[], "total_fullstack_hosts");
  const infraCount = singleCount(infraCountQ.data as Record<string, unknown>[], "total_infra_hosts");
  const totalHosts = singleCount(totalHostQ.data  as Record<string, unknown>[], "total");

  // CPU/mem maps by host name
  const cpuByName = useMemo(() => {
    const m = new Map<string, number>();
    ((cpuQ.data ?? []) as Record<string, unknown>[]).forEach(r => m.set(String(r.name), num(r.avgCpu)));
    return m;
  }, [cpuQ.data]);
  const memByName = useMemo(() => {
    const m = new Map<string, number>();
    ((memQ.data ?? []) as Record<string, unknown>[]).forEach(r => m.set(String(r.name), num(r.avgMem)));
    return m;
  }, [memQ.data]);

  // License consumption + estimated cost per host id
  const fsRate    = rateCard.ratesByName.get(normalizeCapabilityName("Full-Stack Monitoring"))?.price ?? 0;
  const infraRate = rateCard.ratesByName.get(normalizeCapabilityName("Infrastructure Monitoring"))?.price ?? 0;
  const licenseByHost = useMemo(() => {
    const m = new Map<string, { gibH: number; hostH: number; cost: number }>();
    ((licenseQ.data ?? []) as Record<string, unknown>[]).forEach(r => {
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
  interface CloudSummary { total: number; byProvider: Map<string, number> }
  const cloudSummary: CloudSummary = useMemo(() => {
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

  const [cloudFilter, setCloudFilter] = useState<"all" | "cloud" | "onprem">("all");
  const hostsFiltered = useMemo(() => {
    if (cloudFilter === "all") return hosts;
    return hosts.filter((h) => {
      const c = cloudProvider(h.cloudType as string | undefined).isCloud;
      return cloudFilter === "cloud" ? c : !c;
    });
  }, [hosts, cloudFilter]);

  const k8sClusters   = singleCount(k8sClustersQ.data as Record<string, unknown>[], "clusters");
  const k8sNodes      = singleCount(k8sNodeQ.data as Record<string, unknown>[], "total");
  const k8sWorkloads  = singleCount(k8sWlQ.data as Record<string, unknown>[], "total");
  const k8sNamespaces = singleCount(k8sNsQ.data as Record<string, unknown>[], "total");
  const k8sPods       = singleCount(k8sPodQ.data as Record<string, unknown>[], "total");
  const vmCount       = singleCount(vmQ.data    as Record<string, unknown>[], "count");

  // Node license cost grouped by host group (a cluster's nodes share a group)
  const groupRows: ContributorRow[] = useMemo(
    () => (groupCostQ.data ?? []).map((r) => ({ name: String((r as Record<string, unknown>).name ?? "—"), value: Number((r as Record<string, unknown>).value ?? 0) })),
    [groupCostQ.data],
  );
  const groupTotalGibH = groupRows.reduce((s, r) => s + r.value, 0);
  const groupTotalCost = groupTotalGibH * fsRate;

  // ── Per-node real cost (Full-Stack GiB-hours on K8s node hosts) ──────────────
  interface NodeRow { node: string; hostGroup: string; gibH: number; cost: number }
  const nodeRows: NodeRow[] = useMemo(
    () => ((nodeListQ.data ?? []) as Record<string, unknown>[]).map((r) => {
      const gibH = num(r.gib_hours);
      return { node: String(r.node ?? "—"), hostGroup: String(r.hostGroup ?? "—"), gibH, cost: gibH * fsRate };
    }),
    [nodeListQ.data, fsRate],
  );
  // Real Kubernetes node cost = sum of node Full-Stack cost. This is the pool
  // attributed across namespaces/workloads by pod share (no per-pod billing).
  const k8sNodeCost = useMemo(() => nodeRows.reduce((s, r) => s + r.cost, 0), [nodeRows]);

  // ── Namespaces: pods + workloads + attributed cost (by pod share) ────────────
  const nsPodMap = useMemo(() => {
    const m = new Map<string, number>();
    ((nsPodsQ.data ?? []) as Record<string, unknown>[]).forEach((r) => m.set(String(r.name), num(r.pods)));
    return m;
  }, [nsPodsQ.data]);
  const nsWlMap = useMemo(() => {
    const m = new Map<string, number>();
    ((nsWlQ.data ?? []) as Record<string, unknown>[]).forEach((r) => m.set(String(r.name), num(r.workloads)));
    return m;
  }, [nsWlQ.data]);
  const totalPods = useMemo(() => [...nsPodMap.values()].reduce((a, b) => a + b, 0), [nsPodMap]);
  interface NsRow { ns: string; pods: number; workloads: number; cost: number }
  const namespaceRows: NsRow[] = useMemo(() => {
    const names = new Set<string>([...nsPodMap.keys(), ...nsWlMap.keys()]);
    return [...names].map((ns) => {
      const pods = nsPodMap.get(ns) ?? 0;
      return { ns, pods, workloads: nsWlMap.get(ns) ?? 0, cost: totalPods > 0 ? k8sNodeCost * (pods / totalPods) : 0 };
    }).sort((a, b) => b.cost - a.cost || b.pods - a.pods);
  }, [nsPodMap, nsWlMap, totalPods, k8sNodeCost]);

  // ── Top workloads: pods + namespace + attributed cost (by pod share) ─────────
  interface WlRow { workload: string; ns: string; pods: number; cost: number }
  const workloadRows: WlRow[] = useMemo(
    () => ((topWlQ.data ?? []) as Record<string, unknown>[]).map((r) => {
      const pods = num(r.pods);
      return { workload: String(r.workload ?? "—"), ns: String(r.ns ?? "—"), pods, cost: totalPods > 0 ? k8sNodeCost * (pods / totalPods) : 0 };
    }),
    [topWlQ.data, totalPods, k8sNodeCost],
  );

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
          <KpiCard label="Host License Cost" value={licenseQ.isLoading || rateCard.isLoading ? "…" : fmtUSD(totalLicenseCost)} subLabel={`${rateCard.source === "account" ? "account" : "default"} rate · last ${timeRange.hours}h`} isLoading={licenseQ.isLoading || rateCard.isLoading} error={licenseQ.error} colorVariant="critical" icon={consumptionIcon} info={kpiInfo(t, "hostLicenseCost")} />
          {vmCount > 0 && (
            <KpiCard label="Virtual Machines" value={formatCount(vmCount)} subLabel="hypervisor VMs" isLoading={vmQ.isLoading} error={vmQ.error} info={kpiInfo(t, "virtualMachines")} />
          )}
          <KpiCard
            label="Cloud-Inherited Hosts"
            value={hostsQ.isLoading ? "…" : formatCount(cloudSummary.total)}
            subLabel={
              cloudSummary.total === 0
                ? "no cloud hosts detected"
                : [...cloudSummary.byProvider.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([p, c]) => `${c} ${p}`)
                    .join(" · ")
            }
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
        {/* Client-side filter — zero Grail cost. Reuses the same fetched hosts. */}
        <Flex gap={6} alignItems="center">
          {(["all", "cloud", "onprem"] as const).map((key) => {
            const active = cloudFilter === key;
            const label = key === "all" ? `All (${hosts.length})`
                       : key === "cloud" ? `Cloud only (${cloudSummary.total})`
                       :                    `On-prem only (${hosts.length - cloudSummary.total})`;
            return (
              <button
                key={key}
                onClick={() => setCloudFilter(key)}
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  border: `1px solid ${active ? Colors.Border.Primary.Accent : Colors.Border.Neutral.Default}`,
                  background: active ? Colors.Background.Field.Primary.Emphasized : "transparent",
                  color:      active ? Colors.Text.Primary.Default : Colors.Text.Neutral.Default,
                }}
              >
                {label}
              </button>
            );
          })}
        </Flex>
        {hostsQ.error ? (
          <Text style={{ color: "var(--dt-color-text-critical)" }}>Failed to load hosts: {hostsQ.error}</Text>
        ) : hostsQ.isLoading ? (
          <Text style={{ color: "var(--dt-color-text-subdued)" }}>Loading hosts…</Text>
        ) : hostsFiltered.length === 0 ? (
          <Text style={{ color: "var(--dt-color-text-subdued)" }}>{hosts.length === 0 ? "No hosts found." : "No hosts match the current filter."}</Text>
        ) : (
          <div style={{ overflowX: "auto", borderRadius: 6, border: `1px solid ${Colors.Border.Neutral.Default}` }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1180 }}>
              <thead>
                <tr>
                  <th style={{ ...headCell, textAlign: "left" }}>Host</th>
                  <th style={{ ...headCell, textAlign: "left" }}>Cloud</th>
                  <th style={{ ...headCell, textAlign: "left" }}>OS</th>
                  <th style={{ ...headCell, textAlign: "left" }}>Mode</th>
                  <th style={{ ...headCell, textAlign: "right" }}>Cores</th>
                  <th style={{ ...headCell, textAlign: "right" }}>Memory</th>
                  <th style={{ ...headCell, textAlign: "left" }}>Host Group</th>
                  <th style={{ ...headCell, textAlign: "right" }}>Avg CPU</th>
                  <th style={{ ...headCell, textAlign: "right" }}>Avg Mem</th>
                  <th style={{ ...headCell, textAlign: "right" }}>License (GiB·h)</th>
                  <th style={{ ...headCell, textAlign: "right" }}>Est. License Cost</th>
                </tr>
              </thead>
              <tbody>
                {hostsFiltered.map((h, i) => {
                  const name = String(h.name ?? "—");
                  const lic = licenseByHost.get(String(h.id ?? ""));
                  return (
                    <tr key={String(h.id ?? i)}>
                      <td style={{ ...cellBase, fontWeight: 600, color: Colors.Text.Neutral.Default }}>{name}</td>
                      <td style={cellBase}>{cloudBadge(h.cloudType as string | undefined)}</td>
                      <td style={{ ...cellBase, color: Colors.Text.Neutral.Subdued }}>
                        {String(h.osType ?? "—")}{h.osVersion ? ` · ${String(h.osVersion)}` : ""}
                      </td>
                      <td style={cellBase}>{modePill(String(h.monitoringMode ?? "—"))}</td>
                      <td style={{ ...cellBase, textAlign: "right" }}>{num(h.cpuCores) || "—"}</td>
                      <td style={{ ...cellBase, textAlign: "right" }}>{h.memoryTotal ? fmtBytes(num(h.memoryTotal)) : "—"}</td>
                      <td style={{ ...cellBase, color: Colors.Text.Neutral.Subdued }}>{String(h.hostGroupName ?? "—")}</td>
                      <td style={{ ...cellBase, textAlign: "right", fontWeight: 600 }}>{fmtPct(cpuByName.get(name))}</td>
                      <td style={{ ...cellBase, textAlign: "right" }}>{fmtPct(memByName.get(name))}</td>
                      <td style={{ ...cellBase, textAlign: "right" }}>{lic && lic.gibH > 0 ? fmtGibH(lic.gibH) : "—"}</td>
                      <td style={{ ...cellBase, textAlign: "right", fontWeight: 600, color: Colors.Text.Neutral.Default }}>{lic ? fmtUSD(lic.cost) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Flex>

      <Divider />

      {/* ══ Kubernetes ══════════════════════════════════════════════════════════ */}
      <Flex flexDirection="column" gap={8}>
        <Heading level={3}>Kubernetes</Heading>
        {k8sClusters === 0 && !k8sClustersQ.isLoading ? (
          <Text style={{ fontSize: "12px", color: "var(--dt-color-text-subdued)" }}>
            No Kubernetes clusters monitored. Deploy the Dynatrace Operator to break down pods, nodes and
            workloads per namespace.
          </Text>
        ) : (
          <>
            <Flex gap={12} flexWrap="wrap">
              <KpiCard label="Clusters"   value={k8sClustersQ.isLoading ? "…" : formatCount(k8sClusters)}  subLabel="monitored clusters" isLoading={k8sClustersQ.isLoading} error={k8sClustersQ.error} colorVariant="positive" info={kpiInfo(t, "k8sClusters")} />
              <KpiCard label="Nodes"      value={k8sNodeQ.isLoading ? "…" : formatCount(k8sNodes)}         subLabel="cluster nodes"      isLoading={k8sNodeQ.isLoading} error={k8sNodeQ.error} info={kpiInfo(t, "k8sNodes")} />
              <KpiCard label="Pods"       value={k8sPodQ.isLoading ? "…" : formatCount(k8sPods)}           subLabel="running pods"       isLoading={k8sPodQ.isLoading}  error={k8sPodQ.error}  colorVariant="warning" info={kpiInfo(t, "k8sPods")} />
              <KpiCard label="Workloads"  value={k8sWlQ.isLoading ? "…" : formatCount(k8sWorkloads)}       subLabel="deployments/etc."   isLoading={k8sWlQ.isLoading}   error={k8sWlQ.error} info={kpiInfo(t, "k8sWorkloads")} />
              <KpiCard label="Namespaces" value={k8sNsQ.isLoading ? "…" : formatCount(k8sNamespaces)}      subLabel="namespaces"         isLoading={k8sNsQ.isLoading}   error={k8sNsQ.error} info={kpiInfo(t, "k8sNamespaces")} />
              <KpiCard label="Node License Cost" value={groupCostQ.isLoading || rateCard.isLoading ? "…" : fmtUSD(groupTotalCost)} subLabel={`Full-Stack on cluster nodes · last ${timeRange.hours}h`} isLoading={groupCostQ.isLoading} error={groupCostQ.error} colorVariant="critical" info={kpiInfo(t, "nodeLicenseCost")} />
            </Flex>
            <Grid gridTemplateColumns="repeat(auto-fit, minmax(420px, 1fr))" gap={16}>
              <TopContributors
                title="Node License Cost by Cluster (Host Group)"
                unit="cost"
                color={chartColor(8)}
                rows={groupRows}
                isLoading={groupCostQ.isLoading}
                error={groupCostQ.error}
                sectionCost={groupCostQ.isLoading ? undefined : fmtUSD(groupTotalCost)}
                costForShare={(sharePct) => fmtUSD((groupTotalCost * sharePct) / 100)}
              />
            </Grid>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
              Kubernetes nodes are billed as Full-Stack hosts. Cost is grouped by host group (a cluster's nodes
              share a group). Pods, workloads and namespaces are covered by their nodes' Full-Stack license.
            </Text>

            {/* ── Per-node real license cost ─────────────────────────────────── */}
            <Heading level={5} style={{ marginTop: 8 }}>Nodes — License Consumption &amp; Cost</Heading>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
              Real Full-Stack consumption (gibibyte-hours) billed per cluster node, priced with the
              {rateCard.source === "account" ? " account" : " default"} rate card. Window: last {timeRange.hours}h.
            </Text>
            <CostTable
              loading={nodeListQ.isLoading}
              error={nodeListQ.error}
              empty="No Kubernetes node billing in this window."
              columns={["Node", "Host Group", "GiB·hours", "License Cost"]}
              aligns={["left", "left", "right", "right"]}
              rows={nodeRows.map((r) => [r.node, r.hostGroup, fmtGibH(r.gibH), fmtUSD(r.cost)])}
            />

            {/* ── Cost by namespace (attributed) ─────────────────────────────── */}
            <Heading level={5} style={{ marginTop: 8 }}>Namespaces — Workloads, Pods &amp; Attributed Cost</Heading>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
              Pods and workloads per namespace. Cost is the cluster node license ({fmtUSD(k8sNodeCost)})
              attributed by each namespace's share of pods (no separate per-namespace charge exists).
            </Text>
            <CostTable
              loading={nsPodsQ.isLoading || nsWlQ.isLoading}
              error={nsPodsQ.error ?? nsWlQ.error}
              empty="No namespaces found."
              columns={["Namespace", "Workloads", "Pods", "Attributed Cost"]}
              aligns={["left", "right", "right", "right"]}
              rows={namespaceRows.map((r) => [r.ns, String(r.workloads), String(r.pods), fmtUSD(r.cost)])}
            />

            {/* ── Top workloads (attributed) ─────────────────────────────────── */}
            <Heading level={5} style={{ marginTop: 8 }}>Top Workloads — Pods &amp; Attributed Cost</Heading>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
              Largest workloads by pod count, with cost attributed by pod share of the cluster node license.
            </Text>
            <CostTable
              loading={topWlQ.isLoading}
              error={topWlQ.error}
              empty="No workloads found."
              columns={["Workload", "Namespace", "Pods", "Attributed Cost"]}
              aligns={["left", "left", "right", "right"]}
              rows={workloadRows.map((r) => [r.workload, r.ns, String(r.pods), fmtUSD(r.cost)])}
            />
          </>
        )}
      </Flex>

    </Flex>
  );
};
