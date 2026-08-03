import React, { useMemo } from "react";
import { Flex, Grid } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { KpiCard } from "./KpiCard";
import { TopContributors, type ContributorRow } from "./TopContributors";
import { CostTable } from "./CostTable";
import { useDql, formatCount } from "../hooks/useDql";
import { useRateCard } from "../hooks/useRateCard";
import { useCostCalibration } from "../hooks/useCostCalibration";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { kpiInfo } from "../i18n/kpiInfo";
import { normalizeCapabilityName } from "../constants/rateCard";
import { chartColor } from "../constants/palette";
import { fmtGibH, num, singleCount } from "../utils/format";
import {
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
} from "../queries";
import type { TimeRangeOption } from "../types";

/**
 * "Kubernetes" section (Infrastructure tab): cluster/node/pod/workload KPIs,
 * node license cost by host group, per-node real cost and pod-share-attributed
 * cost per namespace and workload. Self-contained — owns its queries (all
 * entity/billing-event based, and shared strings are cache-deduped by useDql).
 */
export const KubernetesSection: React.FC<{ timeRange: TimeRangeOption }> = ({ timeRange }) => {
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

  const rateCard = useRateCard();
  const calibration = useCostCalibration();
  const { money } = useCurrency();
  const { t } = useLang();

  const fsRate = (rateCard.ratesByName.get(normalizeCapabilityName("Full-Stack Monitoring"))?.price ?? 0)
    * calibration.factorFor("Full-Stack Monitoring");

  const k8sClusters   = singleCount(k8sClustersQ.data as Record<string, unknown>[], "clusters");
  const k8sNodes      = singleCount(k8sNodeQ.data as Record<string, unknown>[], "total");
  const k8sWorkloads  = singleCount(k8sWlQ.data as Record<string, unknown>[], "total");
  const k8sNamespaces = singleCount(k8sNsQ.data as Record<string, unknown>[], "total");
  const k8sPods       = singleCount(k8sPodQ.data as Record<string, unknown>[], "total");

  // Node license cost grouped by host group (a cluster's nodes share a group)
  const groupRows: ContributorRow[] = useMemo(
    () => (groupCostQ.data ?? []).map((r) => ({ name: String((r as Record<string, unknown>).name ?? "—"), value: Number((r as Record<string, unknown>).value ?? 0) })),
    [groupCostQ.data],
  );
  const groupTotalCost = groupRows.reduce((s, r) => s + r.value, 0) * fsRate;

  // ── Per-node real cost (Full-Stack GiB-hours on K8s node hosts) ────────────
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

  // ── Namespaces: pods + workloads + attributed cost (by pod share) ──────────
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

  // ── Top workloads: pods + namespace + attributed cost (by pod share) ───────
  interface WlRow { workload: string; ns: string; pods: number; cost: number }
  const workloadRows: WlRow[] = useMemo(
    () => ((topWlQ.data ?? []) as Record<string, unknown>[]).map((r) => {
      const pods = num(r.pods);
      return { workload: String(r.workload ?? "—"), ns: String(r.ns ?? "—"), pods, cost: totalPods > 0 ? k8sNodeCost * (pods / totalPods) : 0 };
    }),
    [topWlQ.data, totalPods, k8sNodeCost],
  );

  if (k8sClusters === 0 && !k8sClustersQ.isLoading) {
    return (
      <Flex flexDirection="column" gap={8}>
        <Heading level={3}>Kubernetes</Heading>
        <Text style={{ fontSize: "12px", color: "var(--dt-color-text-subdued)" }}>
          No Kubernetes clusters monitored. Deploy the Dynatrace Operator to break down pods, nodes and
          workloads per namespace.
        </Text>
      </Flex>
    );
  }

  return (
    <Flex flexDirection="column" gap={8}>
      <Heading level={3}>Kubernetes</Heading>
      <Flex gap={12} flexWrap="wrap">
        <KpiCard label="Clusters"   value={k8sClustersQ.isLoading ? "…" : formatCount(k8sClusters)}  subLabel="monitored clusters" isLoading={k8sClustersQ.isLoading} error={k8sClustersQ.error} colorVariant="positive" info={kpiInfo(t, "k8sClusters")} />
        <KpiCard label="Nodes"      value={k8sNodeQ.isLoading ? "…" : formatCount(k8sNodes)}         subLabel="cluster nodes"      isLoading={k8sNodeQ.isLoading} error={k8sNodeQ.error} info={kpiInfo(t, "k8sNodes")} />
        <KpiCard label="Pods"       value={k8sPodQ.isLoading ? "…" : formatCount(k8sPods)}           subLabel="running pods"       isLoading={k8sPodQ.isLoading}  error={k8sPodQ.error}  colorVariant="warning" info={kpiInfo(t, "k8sPods")} />
        <KpiCard label="Workloads"  value={k8sWlQ.isLoading ? "…" : formatCount(k8sWorkloads)}       subLabel="deployments/etc."   isLoading={k8sWlQ.isLoading}   error={k8sWlQ.error} info={kpiInfo(t, "k8sWorkloads")} />
        <KpiCard label="Namespaces" value={k8sNsQ.isLoading ? "…" : formatCount(k8sNamespaces)}      subLabel="namespaces"         isLoading={k8sNsQ.isLoading}   error={k8sNsQ.error} info={kpiInfo(t, "k8sNamespaces")} />
        <KpiCard label="Node License Cost" value={groupCostQ.isLoading || rateCard.isLoading ? "…" : money(groupTotalCost)} subLabel={`Full-Stack on cluster nodes · last ${timeRange.hours}h`} isLoading={groupCostQ.isLoading} error={groupCostQ.error} colorVariant="critical" info={kpiInfo(t, "nodeLicenseCost")} />
      </Flex>
      <Grid gridTemplateColumns="repeat(auto-fit, minmax(420px, 1fr))" gap={16}>
        <TopContributors
          title="Node License Cost by Cluster (Host Group)"
          unit="cost"
          color={chartColor(8)}
          rows={groupRows}
          isLoading={groupCostQ.isLoading}
          error={groupCostQ.error}
          sectionCost={groupCostQ.isLoading ? undefined : money(groupTotalCost)}
          costForShare={(sharePct) => money((groupTotalCost * sharePct) / 100)}
        />
      </Grid>
      <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
        Kubernetes nodes are billed as Full-Stack hosts. Cost is grouped by host group (a cluster's nodes
        share a group). Pods, workloads and namespaces are covered by their nodes' Full-Stack license.
      </Text>

      {/* ── Per-node real license cost ─────────────────────────────────────── */}
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
        rows={nodeRows.map((r) => [r.node, r.hostGroup, fmtGibH(r.gibH), money(r.cost)])}
      />

      {/* ── Cost by namespace (attributed) ─────────────────────────────────── */}
      <Heading level={5} style={{ marginTop: 8 }}>Namespaces — Workloads, Pods &amp; Attributed Cost</Heading>
      <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
        Pods and workloads per namespace. Cost is the cluster node license ({money(k8sNodeCost)})
        attributed by each namespace's share of pods (no separate per-namespace charge exists).
      </Text>
      <CostTable
        loading={nsPodsQ.isLoading || nsWlQ.isLoading}
        error={nsPodsQ.error ?? nsWlQ.error}
        empty="No namespaces found."
        columns={["Namespace", "Workloads", "Pods", "Attributed Cost"]}
        aligns={["left", "right", "right", "right"]}
        rows={namespaceRows.map((r) => [r.ns, String(r.workloads), String(r.pods), money(r.cost)])}
      />

      {/* ── Top workloads (attributed) ─────────────────────────────────────── */}
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
        rows={workloadRows.map((r) => [r.workload, r.ns, String(r.pods), money(r.cost)])}
      />
    </Flex>
  );
};
