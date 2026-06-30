import React, { useMemo } from "react";
import { Surface, Flex, Grid, Divider } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { KpiCard } from "../components/KpiCard";
import { PageHeader } from "../components/PageHeader";
import { useDql, formatCount } from "../hooks/useDql";
import {
  cloudInstanceQuery,
  azureVmQuery,
  gcpInstanceQuery,
  cloudServiceDduByTypeQuery,
} from "../queries";
import { TopContributors, type ContributorRow } from "../components/TopContributors";
import { chartColor } from "../constants/palette";
import { useLang } from "../context/LanguageContext";
import { kpiInfo } from "../i18n/kpiInfo";
import type { TimeRangeOption } from "../types";

interface CloudProps {
  timeRange: TimeRangeOption;
}

const num = (d: Record<string, unknown>[] | null | undefined, f: string) =>
  Number((d?.[0] as Record<string, unknown> | undefined)?.[f] ?? 0);

// Dynatrace-supported cloud services per provider (catalog of areas).
const AWS_SERVICES = ["EC2", "Lambda", "RDS", "DynamoDB", "S3", "ELB / ALB", "EBS", "ECS", "EKS", "API Gateway", "SQS", "SNS"];
const AZURE_SERVICES = ["Virtual Machines", "Functions", "SQL Database", "Cosmos DB", "Blob Storage", "Load Balancer", "AKS", "App Service", "Service Bus", "Event Hubs"];
const GCP_SERVICES = ["Compute Engine", "Cloud Functions", "Cloud SQL", "Cloud Storage", "GKE", "Load Balancing", "Pub/Sub", "BigQuery", "Cloud Run"];

const ServiceCatalog: React.FC<{ services: string[]; monitored: boolean }> = ({ services, monitored }) => (
  <Grid gridTemplateColumns="repeat(auto-fill, minmax(150px, 1fr))" gap={8}>
    {services.map((s) => (
      <Surface key={s} elevation="flat" style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Default }}>{s}</Text>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, fontSize: "11px" }}>
          {monitored ? "monitored" : "not monitored"}
        </Text>
      </Surface>
    ))}
  </Grid>
);

export const Cloud: React.FC<CloudProps> = ({ timeRange }) => {
  const { t } = useLang();
  const awsQ   = useDql(useMemo(() => cloudInstanceQuery(), []));
  const azureQ = useDql(useMemo(() => azureVmQuery(),       []));
  const gcpQ   = useDql(useMemo(() => gcpInstanceQuery(),   []));
  // Cloud-integration service metric consumption (DDU). Populates only when a
  // CloudWatch / Azure Monitor / Google Cloud integration is connected.
  const dduQ   = useDql(useMemo(() => cloudServiceDduByTypeQuery(timeRange), [timeRange]));

  const loading    = awsQ.isLoading || azureQ.isLoading || gcpQ.isLoading;
  const awsCount   = num(awsQ.data, "count");
  const azureCount = num(azureQ.data, "count");
  const gcpCount   = num(gcpQ.data, "count");
  const totalCloud = awsCount + azureCount + gcpCount;

  const dduRows: ContributorRow[] = useMemo(
    () => ((dduQ.data ?? []) as Record<string, unknown>[]).map((r) => ({
      name: String(r.etype ?? "—"), value: Number(r.dduSum ?? 0),
    })),
    [dduQ.data],
  );
  const hasIntegration = dduRows.length > 0;

  return (
    <Flex flexDirection="column" gap={24} padding={24}>
      <PageHeader
        title="Cloud"
        subtitle="Cloud provider footprint and managed services monitored by Dynatrace. Host and Kubernetes license cost lives in the Infrastructure & K8s tab."
      />

      {/* ════════ SUMMARY ════════ */}
      <Flex gap={12} flexWrap="wrap">
        <KpiCard label="Total Cloud Instances" value={loading ? "…" : formatCount(totalCloud)} subLabel="compute across providers" isLoading={loading} info={kpiInfo(t, "totalCloudInstances")} />
        <KpiCard label="AWS Instances"   value={awsQ.isLoading ? "…" : formatCount(awsCount)}     subLabel="EC2 monitored"           isLoading={awsQ.isLoading}   error={awsQ.error} colorVariant="positive" info={kpiInfo(t, "awsInstances")} />
        <KpiCard label="Azure VMs"       value={azureQ.isLoading ? "…" : formatCount(azureCount)} subLabel="virtual machines"        isLoading={azureQ.isLoading} error={azureQ.error} info={kpiInfo(t, "azureVms")} />
        <KpiCard label="GCP Instances"   value={gcpQ.isLoading ? "…" : formatCount(gcpCount)}     subLabel="compute instances"       isLoading={gcpQ.isLoading}   error={gcpQ.error} info={kpiInfo(t, "gcpInstances")} />
      </Flex>

      {!loading && totalCloud === 0 && (
        <Surface elevation="flat" color="primary" style={{ padding: "14px 18px" }}>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
            No cloud provider integration is currently active in this environment. The areas below show the cloud
            services Dynatrace can monitor — connect AWS (CloudWatch / metric streams), Azure Monitor or Google Cloud,
            or deploy OneAgent on cloud hosts, and their instances, consumption and cost will populate automatically.
          </Text>
        </Surface>
      )}

      <Divider />

      {/* ════════ CLOUD INTEGRATION (CloudWatch / Azure Monitor / GCP) ════════ */}
      <Flex flexDirection="column" gap={8}>
        <Flex alignItems="center" gap={6}>
          <Heading level={3}>{t("cloud.integrationTitle")}</Heading>
        </Flex>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, maxWidth: 980 }}>
          {t("cloud.costNote")}
        </Text>
        {hasIntegration ? (
          <Grid gridTemplateColumns="repeat(auto-fit, minmax(420px, 1fr))" gap={16}>
            <TopContributors
              title={t("cloud.serviceMetricTitle")}
              unit="DDU"
              color={chartColor(2)}
              rows={dduRows}
              isLoading={dduQ.isLoading}
              error={dduQ.error}
            />
          </Grid>
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
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>{formatCount(awsCount)} EC2 instances monitored</Text>
        </Flex>
        <ServiceCatalog services={AWS_SERVICES} monitored={awsCount > 0} />
      </Flex>

      <Divider />

      {/* ════════ AZURE ════════ */}
      <Flex flexDirection="column" gap={8}>
        <Flex justifyContent="space-between" alignItems="baseline" flexWrap="wrap" gap={8}>
          <Heading level={3}>Microsoft Azure</Heading>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>{formatCount(azureCount)} virtual machines monitored</Text>
        </Flex>
        <ServiceCatalog services={AZURE_SERVICES} monitored={azureCount > 0} />
      </Flex>

      <Divider />

      {/* ════════ GCP ════════ */}
      <Flex flexDirection="column" gap={8}>
        <Flex justifyContent="space-between" alignItems="baseline" flexWrap="wrap" gap={8}>
          <Heading level={3}>Google Cloud</Heading>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>{formatCount(gcpCount)} compute instances monitored</Text>
        </Flex>
        <ServiceCatalog services={GCP_SERVICES} monitored={gcpCount > 0} />
      </Flex>
    </Flex>
  );
};
