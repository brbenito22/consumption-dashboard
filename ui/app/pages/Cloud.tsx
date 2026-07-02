import React, { useMemo, useState } from "react";
import { Surface, Flex, Grid, Divider } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { KpiCard } from "../components/KpiCard";
import { PageHeader } from "../components/PageHeader";
import { useDql, formatCount } from "../hooks/useDql";
import { useRateCard } from "../hooks/useRateCard";
import { useCurrency } from "../context/CurrencyContext";
import { normalizeCapabilityName } from "../constants/rateCard";
import {
  awsInventoryQuery,
  azureInventoryQuery,
  gcpInventoryQuery,
  gcpProjectsCountQuery,
  metricsDpsBillingQuery,
  CLOUD_SERVICES,
} from "../queries";
import { CloudServiceSheet } from "./CloudServiceSheet";
import { useLang } from "../context/LanguageContext";
import { kpiInfo } from "../i18n/kpiInfo";
import type { TimeRangeOption } from "../types";

interface CloudProps {
  timeRange: TimeRangeOption;
}

interface InventoryRow { svc: string; count: number }

const toInventory = (data: Record<string, unknown>[] | null): InventoryRow[] =>
  (data ?? []).map((r) => ({
    svc: String((r as Record<string, unknown>).svc ?? "—"),
    count: Number((r as Record<string, unknown>).count ?? 0),
  }));

const sumCount = (rows: InventoryRow[]): number =>
  rows.reduce((s, r) => s + r.count, 0);

const num = (d: Record<string, unknown>[] | null | undefined, f: string) =>
  Number((d?.[0] as Record<string, unknown> | undefined)?.[f] ?? 0);

// Canonical service label lists used as the visual "catalog" per provider.
// Each label maps to at most one inventory row (a service the app queries).
// Services not in the inventory query still render — they show as "not tracked"
// so the user knows Dynatrace can monitor them, but no entity was found.
const AWS_SERVICES = [
  "EC2", "Lambda", "RDS", "S3", "ELB (classic)", "ALB", "NLB",
  "EBS", "DynamoDB", "ECS", "EKS", "API Gateway", "SQS", "SNS",
];
const AZURE_SERVICES = [
  "Virtual Machines", "Functions", "SQL Database", "Cosmos DB",
  "Storage", "Load Balancer", "Web App", "Redis",
  "AKS", "App Service", "Service Bus", "Event Hubs",
];
const GCP_SERVICES = [
  "Compute Engine", "Cloud Functions", "Cloud SQL", "Cloud Storage",
  "GKE", "Cloud Run", "Load Balancing", "Pub/Sub", "BigQuery",
];

const ServiceCatalog: React.FC<{
  services: string[];
  inventory: InventoryRow[];
  onSelect: (svcKey: string) => void;
}> = ({ services, inventory, onSelect }) => {
  const byName = new Map(inventory.map((r) => [r.svc, r.count]));
  return (
    <Grid gridTemplateColumns="repeat(auto-fill, minmax(170px, 1fr))" gap={8}>
      {services.map((s) => {
        const count = byName.get(s);
        const tracked = count !== undefined;
        const monitored = tracked && count > 0;
        // Tile is clickable only when we have a query for it (present in CLOUD_SERVICES).
        // Untracked catalog entries render as static Surface (no drill-down target).
        const canDrill = Boolean(CLOUD_SERVICES[s]);
        const style: React.CSSProperties = {
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          cursor: canDrill ? "pointer" : "default",
        };
        const handleActivate = () => { if (canDrill) onSelect(s); };
        return (
          <Surface
            key={s}
            elevation="flat"
            style={style}
            onClick={canDrill ? handleActivate : undefined}
            onKeyDown={canDrill ? (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleActivate(); }
            } : undefined}
            role={canDrill ? "button" : undefined}
            tabIndex={canDrill ? 0 : undefined}
          >
            <Flex justifyContent="space-between" alignItems="baseline" gap={6}>
              <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Default }}>{s}</Text>
              {tracked && (
                <Text textStyle="small-emphasized" style={{ color: monitored ? Colors.Text.Success.Default : Colors.Text.Neutral.Subdued }}>
                  {formatCount(count)}
                </Text>
              )}
            </Flex>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, fontSize: "11px" }}>
              {monitored ? "monitored · click for details" : tracked ? "no entities" : "not tracked"}
            </Text>
          </Surface>
        );
      })}
    </Grid>
  );
};

export const Cloud: React.FC<CloudProps> = ({ timeRange }) => {
  const { t } = useLang();
  const { money: formatCurrency } = useCurrency();
  const rateCard = useRateCard();
  // Which service tile is currently drilled into (null = sheet closed).
  const [selectedSvc, setSelectedSvc] = useState<string | null>(null);

  const awsQ    = useDql(useMemo(() => awsInventoryQuery(),   []));
  const azureQ  = useDql(useMemo(() => azureInventoryQuery(), []));
  const gcpQ    = useDql(useMemo(() => gcpInventoryQuery(),   []));
  const gcpPrjQ = useDql(useMemo(() => gcpProjectsCountQuery(), []));
  // DPS-priced metrics — replaces DDU as the cloud-service cost signal.
  const dpsQ    = useDql(useMemo(() => metricsDpsBillingQuery(timeRange), [timeRange]));

  const awsInv   = useMemo(() => toInventory(awsQ.data),   [awsQ.data]);
  const azureInv = useMemo(() => toInventory(azureQ.data), [azureQ.data]);
  const gcpInv   = useMemo(() => toInventory(gcpQ.data),   [gcpQ.data]);

  const awsCount   = sumCount(awsInv);
  const azureCount = sumCount(azureInv);
  const gcpCount   = sumCount(gcpInv);
  const totalCloud = awsCount + azureCount + gcpCount;
  const gcpProjects = num(gcpPrjQ.data, "count");

  // Presence of ANY entity across providers OR a connected GCP project is a
  // reliable "integration is live" signal. DDU was previously used here and is
  // 0 in DPS-priced tenants → false negative that hid an actively-integrated
  // cloud environment.
  const hasIntegration = totalCloud > 0 || gcpProjects > 0;

  const loading = awsQ.isLoading || azureQ.isLoading || gcpQ.isLoading;

  // DPS metrics cost: data_points × Metrics-Ingest rate from the rate card.
  const dataPoints = num(dpsQ.data, "data_points");
  const metricsRate = rateCard.ratesByName.get(
    normalizeCapabilityName("Metrics - Ingest & Process"),
  );
  const dpsCost = metricsRate ? dataPoints * metricsRate.price : 0;

  return (
    <Flex flexDirection="column" gap={24} padding={24}>
      <PageHeader
        title="Cloud"
        subtitle={t("cloud.subtitle")}
      />

      {/* ════════ SUMMARY KPIs ════════ */}
      <Flex gap={12} flexWrap="wrap">
        <KpiCard
          label="Total Cloud Entities"
          value={loading ? "…" : formatCount(totalCloud)}
          subLabel="across providers"
          isLoading={loading}
          info={kpiInfo(t, "totalCloudInstances")}
        />
        <KpiCard
          label="AWS Entities"
          value={awsQ.isLoading ? "…" : formatCount(awsCount)}
          subLabel={awsInv.length > 0 ? `${awsInv.filter((r) => r.count > 0).length} of ${awsInv.length} services` : "no data"}
          isLoading={awsQ.isLoading}
          error={awsQ.error}
          colorVariant="positive"
          info={kpiInfo(t, "awsInstances")}
        />
        <KpiCard
          label="Azure Entities"
          value={azureQ.isLoading ? "…" : formatCount(azureCount)}
          subLabel={azureInv.length > 0 ? `${azureInv.filter((r) => r.count > 0).length} of ${azureInv.length} services` : "no data"}
          isLoading={azureQ.isLoading}
          error={azureQ.error}
          info={kpiInfo(t, "azureVms")}
        />
        <KpiCard
          label="GCP Entities"
          value={gcpQ.isLoading ? "…" : formatCount(gcpCount)}
          subLabel={gcpProjects > 0 ? `${gcpProjects} project connected` : (gcpInv.length > 0 ? `${gcpInv.filter((r) => r.count > 0).length} of ${gcpInv.length} services` : "no data")}
          isLoading={gcpQ.isLoading}
          error={gcpQ.error}
          info={kpiInfo(t, "gcpInstances")}
        />
      </Flex>

      {!loading && !hasIntegration && (
        <Surface elevation="flat" color="primary" style={{ padding: "14px 18px" }}>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
            {t("cloud.noIntegrationRoot")}
          </Text>
        </Surface>
      )}

      <Divider />

      {/* ════════ CLOUD METRICS (DPS) COST ════════ */}
      <Flex flexDirection="column" gap={8}>
        <Flex alignItems="center" gap={6}>
          <Heading level={3}>{t("cloud.metricsTitle")}</Heading>
        </Flex>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, maxWidth: 980 }}>
          {t("cloud.metricsNote")}
        </Text>
        {hasIntegration ? (
          <Flex gap={12} flexWrap="wrap">
            <KpiCard
              label="Metrics Data Points (window)"
              value={dpsQ.isLoading ? "…" : formatCount(dataPoints)}
              subLabel={`billed as “Metrics - Ingest & Process”`}
              isLoading={dpsQ.isLoading}
              error={dpsQ.error}
            />
            <KpiCard
              label="Metrics Cost (window)"
              value={dpsQ.isLoading || rateCard.isLoading ? "…" : formatCurrency(dpsCost)}
              subLabel={metricsRate ? `${metricsRate.quotedUnitOfMeasure}` : "no rate matched"}
              isLoading={dpsQ.isLoading || rateCard.isLoading}
              colorVariant={dpsCost > 0 ? "warning" : "default"}
            />
          </Flex>
        ) : (
          <Surface elevation="flat" color="primary" style={{ padding: "14px 18px" }}>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
              {t("cloud.noIntegration")}
            </Text>
          </Surface>
        )}
      </Flex>

      <Divider />

      {/* ════════ AWS ════════ */}
      <Flex flexDirection="column" gap={8}>
        <Flex justifyContent="space-between" alignItems="baseline" flexWrap="wrap" gap={8}>
          <Heading level={3}>Amazon Web Services</Heading>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
            {formatCount(awsCount)} entities across {awsInv.length} tracked services
          </Text>
        </Flex>
        <ServiceCatalog services={AWS_SERVICES} inventory={awsInv} onSelect={setSelectedSvc} />
      </Flex>

      <Divider />

      {/* ════════ AZURE ════════ */}
      <Flex flexDirection="column" gap={8}>
        <Flex justifyContent="space-between" alignItems="baseline" flexWrap="wrap" gap={8}>
          <Heading level={3}>Microsoft Azure</Heading>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
            {formatCount(azureCount)} entities across {azureInv.length} tracked services
          </Text>
        </Flex>
        <ServiceCatalog services={AZURE_SERVICES} inventory={azureInv} onSelect={setSelectedSvc} />
      </Flex>

      <Divider />

      {/* ════════ GCP ════════ */}
      <Flex flexDirection="column" gap={8}>
        <Flex justifyContent="space-between" alignItems="baseline" flexWrap="wrap" gap={8}>
          <Heading level={3}>Google Cloud</Heading>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
            {formatCount(gcpCount)} entities across {gcpInv.length} tracked services
            {gcpProjects > 0 ? ` · ${gcpProjects} project connected` : ""}
          </Text>
        </Flex>
        <ServiceCatalog services={GCP_SERVICES} inventory={gcpInv} onSelect={setSelectedSvc} />
      </Flex>

      {/* Side sheet with the drill-down list of entities for the selected service. */}
      <CloudServiceSheet serviceKey={selectedSvc} onDismiss={() => setSelectedSvc(null)} />
    </Flex>
  );
};
