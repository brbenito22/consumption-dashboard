import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { MeterbarIcon } from "@dynatrace/strato-icons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { KpiCard } from "./KpiCard";
import { useDql, formatCount } from "../hooks/useDql";
import {
  awsInventoryQuery,
  azureInventoryQuery,
  gcpInventoryQuery,
  gcpProjectsCountQuery,
  metricsDpsBillingQuery,
  hostListDetailQuery,
} from "../queries";
import { useRateCard } from "../hooks/useRateCard";
import { useCostCalibration } from "../hooks/useCostCalibration";
import { useCurrency } from "../context/CurrencyContext";
import { normalizeCapabilityName } from "../constants/rateCard";
import type { TimeRangeOption } from "../types";

const consumptionIcon = <MeterbarIcon style={{ width: 16, height: 16 }} />;

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

/**
 * "Multi-Cloud Footprint" section (Overview): per-provider inventory,
 * OneAgent-inherited cloud hosts and the DPS metrics cost KPI.
 *
 * COST NOTE: every query here is string-identical to what the Cloud and
 * Infrastructure tabs already run — the useDql session cache dedups them, so
 * this section adds ZERO Grail scan.
 */
export const MultiCloudFootprint: React.FC<{ timeRange: TimeRangeOption }> = ({ timeRange }) => {
  const awsInvQ      = useDql(useMemo(() => awsInventoryQuery(),   []));
  const azureInvQ    = useDql(useMemo(() => azureInventoryQuery(), []));
  const gcpInvQ      = useDql(useMemo(() => gcpInventoryQuery(),   []));
  const gcpPrjQ      = useDql(useMemo(() => gcpProjectsCountQuery(), []));
  const dpsQ         = useDql(useMemo(() => metricsDpsBillingQuery(timeRange), [timeRange]));
  const hostsDetailQ = useDql(useMemo(() => hostListDetailQuery(), []));

  const rateCard = useRateCard();
  const calibration = useCostCalibration();
  const { money } = useCurrency();

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
  );
};
