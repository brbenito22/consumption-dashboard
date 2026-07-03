import type { TimeRangeOption } from "./types";

/**
 * All DQL queries for the Consumption Dashboard.
 * Each function receives a TimeRangeOption and returns a DQL string.
 * Metric keys containing ":" must be wrapped in backticks in DQL.
 */

// ── OBSERVABILITY ─────────────────────────────────────────────────────────────

export const logsCountQuery = (tr: TimeRangeOption) => `
fetch logs, from:${tr.dqlFrom}, to:${tr.dqlTo}
| summarize count = count(), by: { interval = bin(timestamp, ${tr.binInterval}) }
| sort interval asc
`.trim();

// COST-OPTIMIZED: span counts come from dt.system.events (ingested_spans),
// which scans ~0 GB, instead of "fetch spans" which scans many GB per call.
export const spansCountQuery = (tr: TimeRangeOption) => `
fetch dt.system.events, from:${tr.dqlFrom}, to:${tr.dqlTo}
| filter event.kind == "BILLING_USAGE_EVENT" and event.type == "Traces - Ingest & Process"
| summarize count = sum(coalesce(ingested_spans, 0)), by: { interval = bin(timestamp, ${tr.binInterval}) }
| sort interval asc
`.trim();

/** Total span count over the window. */
export const spansTotalQuery = (tr: TimeRangeOption) => `
fetch spans, from:${tr.dqlFrom}, to:${tr.dqlTo}
| summarize total = count()
`.trim();

export const eventsCountQuery = (tr: TimeRangeOption) => `
fetch events, from:${tr.dqlFrom}, to:${tr.dqlTo}
| summarize count = count(), by: { interval = bin(timestamp, ${tr.binInterval}) }
| sort interval asc
`.trim();

export const bizeventsCountQuery = (tr: TimeRangeOption) => `
fetch bizevents, from:${tr.dqlFrom}, to:${tr.dqlTo}
| summarize count = count(), by: { interval = bin(timestamp, ${tr.binInterval}) }
| sort interval asc
`.trim();

// ── TOP CONTRIBUTORS (biggest ingestion offenders) ───────────────────────────

// Offender breakdowns require fetch logs/spans (no metric for group-by-name),
// so they use a fixed 24h window to keep the Grail scan small (≈7× cheaper
// than a 7-day scan). The trailing `_tr` keeps a uniform signature.
/** Top log sources by record count (last 24h). */
export const topLogSourcesQuery = (_tr: TimeRangeOption) => `
fetch logs, from:now()-24h, to:now()
| summarize value = count(), by: { name = log.source }
| sort value desc
| limit 8
`.trim();

/** Top span operations by span count (last 24h). */
export const topSpanOpsQuery = (_tr: TimeRangeOption) => `
fetch spans, from:now()-24h, to:now()
| summarize value = count(), by: { name = span.name }
| sort value desc
| limit 8
`.trim();

/** Top event kinds by count. */
export const topEventKindsQuery = (tr: TimeRangeOption) => `
fetch events, from:${tr.dqlFrom}, to:${tr.dqlTo}
| summarize value = count(), by: { name = event.kind }
| sort value desc
| limit 8
`.trim();

/** Top business event types by count. */
export const topBizTypesQuery = (tr: TimeRangeOption) => `
fetch bizevents, from:${tr.dqlFrom}, to:${tr.dqlTo}
| summarize value = count(), by: { name = event.type }
| sort value desc
| limit 8
`.trim();

/** Top service endpoints by request/span count (last 24h). */
export const topEndpointsQuery = (_tr: TimeRangeOption) => `
fetch spans, from:now()-24h, to:now()
| filter isNotNull(endpoint.name)
| summarize value = count(), by: { name = endpoint.name }
| sort value desc
| limit 8
`.trim();

/** Top span operations by count (application perspective, last 24h). */
export const topAppOpsQuery = (_tr: TimeRangeOption) => `
fetch spans, from:now()-24h, to:now()
| summarize value = count(), by: { name = span.name }
| sort value desc
| limit 8
`.trim();

// ── WORKLOADS & TECHNOLOGIES (granular monitored footprint) ───────────────────

/** Monitored services grouped by primary software technology. */
export const servicesByTechQuery = () => `
fetch dt.entity.service
| fieldsAdd t = arrayFirst(softwareTechnologies)
| fieldsAdd techType = if(isNotNull(t), splitString(splitString(t, ",")[0], ":")[1], else: "Other")
| summarize value = count(), by: { name = techType }
| sort value desc
| limit 8
`.trim();

/** Monitored process groups grouped by primary software technology. */
export const processGroupsByTechQuery = () => `
fetch dt.entity.process_group
| fieldsAdd t = arrayFirst(softwareTechnologies)
| fieldsAdd techType = if(isNotNull(t), splitString(splitString(t, ",")[0], ":")[1], else: "Unmonitored")
| summarize value = count(), by: { name = techType }
| sort value desc
| limit 8
`.trim();

/** Total monitored process groups. */
export const processGroupCountQuery = () => `
fetch dt.entity.process_group
| summarize total = count()
`.trim();

/** Total monitored process group instances (running processes). */
export const processInstanceCountQuery = () => `
fetch dt.entity.process_group_instance
| summarize total = count()
`.trim();

// ── METRICS ───────────────────────────────────────────────────────────────────

// Full Stack host memory used (bytes) — confirmed working metric in this environment.
// builtin:billing.fullstack.usage_avg is empty in sprint/trial envs; dt.host.memory.used works.
// Divide result by 1,073,741,824 to convert bytes → GiB for billing GiB-h calculation.
export const fullStackBillingQuery = (tr: TimeRangeOption) =>
  "timeseries val = avg(`dt.host.memory.used`), from:" + tr.dqlFrom + ", to:" + tr.dqlTo + ", interval:" + tr.binInterval;

// Infrastructure host memory used (bytes) — same approach as Full Stack.
export const infraBillingQuery = (tr: TimeRangeOption) =>
  "timeseries val = avg(`dt.host.memory.used`), from:" + tr.dqlFrom + ", to:" + tr.dqlTo + ", interval:" + tr.binInterval;

// Log ingest bytes
export const logIngestBytesQuery = (tr: TimeRangeOption) =>
  "timeseries val = sum(`builtin:billing.log.ingest_bytes`), from:" + tr.dqlFrom + ", to:" + tr.dqlTo + ", interval:" + tr.binInterval;

// RUM sessions (without replay)
export const rumSessionsQuery = (tr: TimeRangeOption) =>
  "timeseries val = sum(`builtin:billing.rum.sessions_without_replay`), from:" + tr.dqlFrom + ", to:" + tr.dqlTo + ", interval:" + tr.binInterval;

// RUM sessions with replay
export const rumSessionsWithReplayQuery = (tr: TimeRangeOption) =>
  "timeseries val = sum(`builtin:billing.rum.sessions_with_replay`), from:" + tr.dqlFrom + ", to:" + tr.dqlTo + ", interval:" + tr.binInterval;

// Synthetic executions
export const syntheticBillingQuery = (tr: TimeRangeOption) =>
  "timeseries val = sum(`builtin:billing.synthetic.actions`), from:" + tr.dqlFrom + ", to:" + tr.dqlTo + ", interval:" + tr.binInterval;

// AppEngine DDUs
export const appEngineDduQuery = (tr: TimeRangeOption) =>
  "timeseries val = sum(`builtin:billing.app.engine.ddu`), from:" + tr.dqlFrom + ", to:" + tr.dqlTo + ", interval:" + tr.binInterval;

// Events DPS billing
export const eventsDpsQuery = (tr: TimeRangeOption) =>
  "timeseries val = sum(`builtin:billing.events.dps`), from:" + tr.dqlFrom + ", to:" + tr.dqlTo + ", interval:" + tr.binInterval;

// Kubernetes metrics (for billing: pod-hours and node-hours)
export const k8sPodCountQuery = (tr: TimeRangeOption) =>
  "timeseries val = max(`builtin:kubernetes.pods`), from:" + tr.dqlFrom + ", to:" + tr.dqlTo + ", interval:" + tr.binInterval;

export const k8sNodeCountQuery = (tr: TimeRangeOption) =>
  "timeseries val = max(`builtin:kubernetes.nodes`), from:" + tr.dqlFrom + ", to:" + tr.dqlTo + ", interval:" + tr.binInterval;

// ── ENTITIES SNAPSHOT ─────────────────────────────────────────────────────────

/**
 * Host list — confirmed working fields: id, entity.name, monitoringMode
 * NOTE: entityName, entityId, properties.* do NOT work in | fields in this DQL version.
 * Only id, entity.name, and filter-able fields (monitoringMode) are accessible.
 */
export const hostListQuery = () => `
fetch dt.entity.host
| fields id, \`entity.name\`, monitoringMode
| sort \`entity.name\` asc
| limit 100
`.trim();

/** Count of hosts grouped by monitoring type. */
export const hostsByMonitoringTypeQuery = () => `
fetch dt.entity.host
| summarize count = count(), by: { monitoringType = properties.monitoringType }
`.trim();

/** Full Stack hosts count — using monitoringMode filter (exact query confirmed working). */
export const fullStackHostCountQuery = () => `
fetch dt.entity.host
| filter monitoringMode == "FULL_STACK"
| summarize total_fullstack_hosts = countDistinct(id)
`.trim();

/** Infrastructure hosts count — using monitoringMode filter (exact query confirmed working). */
// Infrastructure-monitored hosts = any host not in Full-Stack mode
// (covers INFRASTRUCTURE / CLOUD_INFRASTRUCTURE / DISCOVERY variants).
export const infraHostCountQuery = () => `
fetch dt.entity.host
| filter monitoringMode != "FULL_STACK"
| summarize total_infra_hosts = count()
`.trim();

/** Total monitored hosts count. */
export const totalMonitoredHostsQuery = () => `
fetch dt.entity.host
| summarize total = count()
`.trim();

/** Detailed host inventory — confirmed fields for this environment.
 *  `cloudType` added to surface cloud provenance in the inventory table.
 *  Same `fetch dt.entity.host` — entity data is not priced per byte scanned,
 *  so adding this field is effectively zero-cost. */
export const hostListDetailQuery = () => `
fetch dt.entity.host
| fields id, name = entity.name, monitoringMode, osType, osVersion, cpuCores, memoryTotal, hostGroupName, networkZone, cloudType
| sort name asc
| limit 200
`.trim();

/** Average CPU usage per host (scalar via arrayAvg — robust to parse). */
export const hostCpuByHostQuery = (tr: TimeRangeOption) => `
timeseries cpu = avg(dt.host.cpu.usage), by: { dt.entity.host }, from: ${tr.dqlFrom}, to: ${tr.dqlTo}, interval: ${tr.binInterval}
| fieldsAdd name = entityName(dt.entity.host), avgCpu = arrayAvg(cpu)
| fields name, avgCpu
| sort avgCpu desc
| limit 200
`.trim();

/**
 * Host-attributed license consumption from billing usage events.
 * Full-Stack is billed in gibibyte-hours, Infrastructure in host-hours,
 * both carrying the dt.entity.host dimension.
 */
export const hostLicenseQuery = (tr: TimeRangeOption) => `
fetch dt.system.events, from: ${tr.dqlFrom}, to: ${tr.dqlTo}
| filter event.kind == "BILLING_USAGE_EVENT" and isNotNull(dt.entity.host)
| summarize {
    gib_hours  = sum(coalesce(billed_gibibyte_hours, 0.0)),
    host_hours = sum(coalesce(billed_host_hours, 0.0))
  }, by: { host = dt.entity.host }
`.trim();

/** Average memory usage per host (scalar). */
export const hostMemByHostQuery = (tr: TimeRangeOption) => `
timeseries mem = avg(dt.host.memory.usage), by: { dt.entity.host }, from: ${tr.dqlFrom}, to: ${tr.dqlTo}, interval: ${tr.binInterval}
| fieldsAdd name = entityName(dt.entity.host), avgMem = arrayAvg(mem)
| fields name, avgMem
| limit 200
`.trim();

/**
 * CPU usage across all hosts — confirmed working in this DQL environment.
 * builtin:host.mem.usage has no data in sprint/trial envs; dt.host.cpu.usage works.
 */
export const hostCpuQuery = (tr: TimeRangeOption) =>
  "timeseries cpuPct = avg(`dt.host.cpu.usage`), from:" + tr.dqlFrom + ", to:" + tr.dqlTo + ", interval:" + tr.binInterval;

// K8s cluster count
export const k8sClusterCountQuery = () => `
fetch dt.entity.kubernetes_cluster
| summarize clusters = count()
`.trim();

/** Kubernetes entity counts (nodes, workloads, namespaces, pods). */
export const k8sNodeCountEntityQuery = () => `
fetch dt.entity.kubernetes_node
| summarize total = count()
`.trim();

export const k8sWorkloadCountQuery = () => `
fetch dt.entity.cloud_application
| summarize total = count()
`.trim();

export const k8sNamespaceCountQuery = () => `
fetch dt.entity.cloud_application_namespace
| summarize total = count()
`.trim();

export const k8sPodCountEntityQuery = () => `
fetch dt.entity.cloud_application_instance
| summarize total = count()
`.trim();

/**
 * Full-Stack license consumption (GiB-hours) grouped by host group — K8s
 * cluster nodes share a host group, so this surfaces the cluster's node cost.
 * Multiply value × Full-Stack rate for the cost.
 */
export const costByHostGroupQuery = (tr: TimeRangeOption) => `
fetch dt.system.events, from: ${tr.dqlFrom}, to: ${tr.dqlTo}
| filter event.kind == "BILLING_USAGE_EVENT" and event.type == "Full-Stack Monitoring" and isNotNull(dt.entity.host)
| summarize gib_hours = sum(coalesce(billed_gibibyte_hours, 0.0)), by: { id = dt.entity.host }
| lookup [ fetch dt.entity.host | fields id, hostGroupName ], sourceField: id, lookupField: id
| summarize value = sum(gib_hours), by: { name = lookup.hostGroupName }
| filter isNotNull(name)
| sort value desc
| limit 8
`.trim();

// K8s workloads (cloud_application) grouped by namespace
export const k8sClusterQuery = () => `
fetch dt.entity.cloud_application
| fields name, namespace = properties.namespaceName
| summarize workloads = count(), by: { namespace }
| sort workloads desc
| limit 20
`.trim();

/**
 * Per-node Full-Stack license consumption (GiB-hours), restricted to hosts
 * that are Kubernetes nodes (joined by name to dt.entity.kubernetes_node).
 * Multiply gib_hours × Full-Stack rate for the real per-node cost.
 */
export const k8sNodeLicenseListQuery = (tr: TimeRangeOption) => `
fetch dt.system.events, from: ${tr.dqlFrom}, to: ${tr.dqlTo}
| filter event.kind == "BILLING_USAGE_EVENT" and event.type == "Full-Stack Monitoring" and isNotNull(dt.entity.host)
| summarize gib_hours = sum(coalesce(billed_gibibyte_hours, 0.0)), by: { id = dt.entity.host }
| lookup [ fetch dt.entity.host | fields id, hname = entity.name, hg = hostGroupName ], sourceField: id, lookupField: id
| fieldsAdd node = lookup.hname, hostGroup = lookup.hg
| lookup [ fetch dt.entity.kubernetes_node | fields knName = entity.name ], sourceField: node, lookupField: knName
| filter isNotNull(lookup.knName)
| fields node, hostGroup, gib_hours
| sort gib_hours desc
| limit 100
`.trim();

/** Pod count per Kubernetes namespace (entity snapshot). */
export const k8sPodsByNamespaceQuery = () => `
fetch dt.entity.cloud_application_instance
| fieldsAdd ns = namespaceName
| filter isNotNull(ns)
| summarize pods = count(), by: { name = ns }
| sort pods desc
| limit 50
`.trim();

/** Workload count per Kubernetes namespace (entity snapshot). */
export const k8sWorkloadsByNamespaceQuery = () => `
fetch dt.entity.cloud_application
| fieldsAdd ns = namespaceName
| filter isNotNull(ns)
| summarize workloads = count(), by: { name = ns }
| sort workloads desc
| limit 50
`.trim();

/** Top Kubernetes workloads by pod count, with their namespace. */
export const k8sTopWorkloadsQuery = () => `
fetch dt.entity.cloud_application_instance
| fieldsAdd wlId = instance_of[dt.entity.cloud_application], ns = namespaceName
| filter isNotNull(wlId)
| summarize pods = count(), by: { wlId, ns }
| lookup [ fetch dt.entity.cloud_application | fields id, wlName = entity.name ], sourceField: wlId, lookupField: id
| fields workload = lookup.wlName, ns, pods
| sort pods desc
| limit 15
`.trim();

// Virtual machines (hypervisor-hosted)
export const virtualMachineQuery = () => `
fetch dt.entity.virtualmachine
| summarize count = count()
`.trim();

/**
 * Cloud HOST monitoring cost grouped by cloud provider (host's cloudType).
 * Cloud hosts running OneAgent are billed as Full-Stack (GiB-hours) or
 * Infrastructure (host-hours) — this attributes that real billing to AWS /
 * Azure / GCP. Multiply gib_hours × Full-Stack rate + host_hours × Infra rate.
 */
export const cloudHostCostByProviderQuery = (tr: TimeRangeOption) => `
fetch dt.system.events, from: ${tr.dqlFrom}, to: ${tr.dqlTo}
| filter event.kind == "BILLING_USAGE_EVENT" and (event.type == "Full-Stack Monitoring" or event.type == "Infrastructure Monitoring") and isNotNull(dt.entity.host)
| summarize { gib_hours = sum(coalesce(billed_gibibyte_hours, 0.0)), host_hours = sum(coalesce(billed_host_hours, 0.0)) }, by: { id = dt.entity.host }
| lookup [ fetch dt.entity.host | fields id, cloudType ], sourceField: id, lookupField: id
| filter isNotNull(lookup.cloudType)
| summarize { gib_hours = sum(gib_hours), host_hours = sum(host_hours), hosts = count() }, by: { cloudType = lookup.cloudType }
| sort gib_hours desc
| limit 20
`.trim();

/**
 * Cloud SERVICE metric consumption (Davis Data Units) grouped by the monitored
 * entity type — RDS, Lambda, S3, etc. monitored via CloudWatch / Azure Monitor
 * consume DDUs (billed under Metrics). Populates once a cloud integration is
 * connected; empty otherwise. byEntity already excludes host-included metrics.
 *
 * NOTE: `by: { dt.entity }` is rejected by Grail ("doesn't match an entity
 * definition"). Use `dt.entity.host` as the dimension — cloud-service DDU
 * attributed to hosts (CloudWatch / Azure Monitor entities) still flows through
 * this dimension via entityAttr. Falls back to the empty state in Cloud.tsx
 * when no integration is connected.
 */
export const cloudServiceDduByTypeQuery = (tr: TimeRangeOption) => `
timeseries ddu = sum(\`builtin:billing.ddu.metrics.byEntity\`), by: { dt.entity.host }, from: ${tr.dqlFrom}, to: ${tr.dqlTo}, interval: ${tr.binInterval}
| fieldsAdd total = arraySum(ddu)
| filter total > 0
| fieldsAdd etype = entityAttr(dt.entity.host, "entity.type")
| filter matchesPhrase(etype, "cloud") or matchesPhrase(etype, "aws") or matchesPhrase(etype, "azure") or matchesPhrase(etype, "gcp") or matchesPhrase(etype, "host")
| summarize dduSum = sum(total), by: { etype }
| sort dduSum desc
| limit 25
`.trim();

/** Total metric DDU consumption (informational — cloud services contribute). */
export const dduTotalQuery = (tr: TimeRangeOption) =>
  "timeseries ddu = sum(`builtin:billing.ddu.metrics.byEntity`), from:" + tr.dqlFrom + ", to:" + tr.dqlTo + ", interval:" + tr.binInterval;

/**
 * Cloud compute instance counts — kept as compat exports for any other page
 * that imports them. The Cloud tab now uses the multi-service inventory
 * queries below instead (`awsInventoryQuery` / `azureInventoryQuery` /
 * `gcpInventoryQuery`) — compute-only counting missed Lambda / RDS / GCS /
 * managed services entirely.
 */
export const cloudInstanceQuery = () => `
fetch dt.entity.ec2_instance
| summarize count = count()
`.trim();

export const azureVmQuery = () => `
fetch dt.entity.azure_vm
| summarize count = count()
`.trim();

export const gcpInstanceQuery = () => `
fetch \`dt.entity.cloud:gcp:gce_instance\`
| summarize count = count()
`.trim();

/**
 * AWS SERVICE INVENTORY — one row per service with its entity count.
 * Uses `append` to fan-out multiple `fetch` calls; each `fetch` returns 1 row
 * (count from `summarize`) tagged with the service label. If an entity type
 * does not exist in the tenant, the sub-query returns 0 and the row still
 * appears (safe by construction — every `fetch dt.entity.X | summarize count`
 * yields exactly one row even when X is empty).
 *
 * Entity types validated against `dt.semantic_dictionary.models`.
 */
export const awsInventoryQuery = () => `
fetch dt.entity.ec2_instance | summarize count = count() | fieldsAdd svc = "EC2"
| append [ fetch dt.entity.aws_lambda_function | summarize count = count() | fieldsAdd svc = "Lambda" ]
| append [ fetch dt.entity.relational_database_service | summarize count = count() | fieldsAdd svc = "RDS" ]
| append [ fetch dt.entity.elastic_load_balancer | summarize count = count() | fieldsAdd svc = "ELB (classic)" ]
| append [ fetch dt.entity.aws_application_load_balancer | summarize count = count() | fieldsAdd svc = "ALB" ]
| append [ fetch dt.entity.aws_network_load_balancer | summarize count = count() | fieldsAdd svc = "NLB" ]
| append [ fetch dt.entity.ebs_volume | summarize count = count() | fieldsAdd svc = "EBS" ]
| fields svc, count
| sort count desc
`.trim();

/** Azure SERVICE INVENTORY — same shape as AWS. Entity types use `azure_*`. */
export const azureInventoryQuery = () => `
fetch dt.entity.azure_vm | summarize count = count() | fieldsAdd svc = "Virtual Machines"
| append [ fetch dt.entity.azure_function_app | summarize count = count() | fieldsAdd svc = "Functions" ]
| append [ fetch dt.entity.azure_sql_database | summarize count = count() | fieldsAdd svc = "SQL Database" ]
| append [ fetch dt.entity.azure_cosmos_db | summarize count = count() | fieldsAdd svc = "Cosmos DB" ]
| append [ fetch dt.entity.azure_storage_account | summarize count = count() | fieldsAdd svc = "Storage" ]
| append [ fetch dt.entity.azure_web_app | summarize count = count() | fieldsAdd svc = "Web App" ]
| append [ fetch dt.entity.azure_load_balancer | summarize count = count() | fieldsAdd svc = "Load Balancer" ]
| append [ fetch dt.entity.azure_redis_cache | summarize count = count() | fieldsAdd svc = "Redis" ]
| fields svc, count
| sort count desc
`.trim();

/**
 * GCP SERVICE INVENTORY — same shape, but entity types live under the
 * `cloud:gcp:*` namespace and MUST be wrapped in backticks (colons are
 * otherwise rejected by the DQL parser).
 */
export const gcpInventoryQuery = () => `
fetch \`dt.entity.cloud:gcp:gce_instance\` | summarize count = count() | fieldsAdd svc = "Compute Engine"
| append [ fetch \`dt.entity.cloud:gcp:cloud_function\` | summarize count = count() | fieldsAdd svc = "Cloud Functions" ]
| append [ fetch \`dt.entity.cloud:gcp:cloudsql_database\` | summarize count = count() | fieldsAdd svc = "Cloud SQL" ]
| append [ fetch \`dt.entity.cloud:gcp:gcs_bucket\` | summarize count = count() | fieldsAdd svc = "Cloud Storage" ]
| append [ fetch \`dt.entity.cloud:gcp:k8s_cluster\` | summarize count = count() | fieldsAdd svc = "GKE" ]
| fields svc, count
| sort count desc
`.trim();

/**
 * GCP integration signal — number of connected GCP projects.
 * Validated on a real cloud-connected tenant: `count = 1` even when compute hosts are managed
 * without OneAgent. AWS/Azure credentials entities are NOT reliable signals
 * (they return 0 in a tenant with clearly active EC2/VM inventory), so we
 * rely on the multi-service inventory totals for those two providers.
 */
export const gcpProjectsCountQuery = () => `
fetch \`dt.entity.cloud:gcp:project\`
| summarize count = count()
`.trim();

/**
 * Cloud service class — used by the entity drill-down sheet to decide which
 * disclaimer to show. `hostBacked` runs OneAgent and has authoritative
 * per-host cost in the Infrastructure & K8s tab; `managed` is monitored via
 * CloudWatch / Azure Monitor / Google Cloud and has no per-service SKU.
 */
export type CloudServiceClass = "hostBacked" | "managed";

export interface CloudServiceMeta {
  /** Provider bucket used to group tiles in the UI. */
  provider: "AWS" | "Azure" | "GCP";
  /** Display label shown in the tile and in the Sheet header. */
  label: string;
  /** DQL entity type — with backticks already applied when required. */
  entityRef: string;
  /** Cost-attribution model — see `CloudServiceClass`. */
  cls: CloudServiceClass;
  /**
   * For `hostBacked` services only: the `cloudType` value used by
   * `dt.entity.host` to filter hosts running OneAgent on this cloud.
   * `EC2`, `AZURE`, `GOOGLE_CLOUD_PLATFORM` — confirmed via `execute_dql`.
   */
  hostCloudType?: string;
}

/**
 * Canonical service registry — the ONLY place service metadata lives.
 * `Cloud.tsx` reads this to render tiles + open the drill-down Sheet.
 * Keys mirror the `svc` label produced by the inventory queries above so the
 * inventory row → service metadata lookup is a straight `Map.get(row.svc)`.
 *
 * Entity types validated against `dt.semantic_dictionary.models`; GCP types
 * (namespace `cloud:gcp:*`) require the backticks retained inside the string.
 */
export const CLOUD_SERVICES: Record<string, CloudServiceMeta> = {
  // AWS
  "EC2":              { provider: "AWS",   label: "EC2",              entityRef: "dt.entity.ec2_instance",                cls: "hostBacked", hostCloudType: "EC2" },
  "Lambda":           { provider: "AWS",   label: "Lambda",           entityRef: "dt.entity.aws_lambda_function",         cls: "managed"    },
  "RDS":              { provider: "AWS",   label: "RDS",              entityRef: "dt.entity.relational_database_service", cls: "managed"    },
  "ELB (classic)":    { provider: "AWS",   label: "ELB (classic)",    entityRef: "dt.entity.elastic_load_balancer",       cls: "managed"    },
  "ALB":              { provider: "AWS",   label: "ALB",              entityRef: "dt.entity.aws_application_load_balancer", cls: "managed"  },
  "NLB":              { provider: "AWS",   label: "NLB",              entityRef: "dt.entity.aws_network_load_balancer",   cls: "managed"    },
  "EBS":              { provider: "AWS",   label: "EBS",              entityRef: "dt.entity.ebs_volume",                  cls: "managed"    },
  // Azure
  "Virtual Machines": { provider: "Azure", label: "Virtual Machines", entityRef: "dt.entity.azure_vm",                    cls: "hostBacked", hostCloudType: "AZURE" },
  "Functions":        { provider: "Azure", label: "Functions",        entityRef: "dt.entity.azure_function_app",          cls: "managed"    },
  "SQL Database":     { provider: "Azure", label: "SQL Database",     entityRef: "dt.entity.azure_sql_database",          cls: "managed"    },
  "Cosmos DB":        { provider: "Azure", label: "Cosmos DB",        entityRef: "dt.entity.azure_cosmos_db",             cls: "managed"    },
  "Storage":          { provider: "Azure", label: "Storage",          entityRef: "dt.entity.azure_storage_account",       cls: "managed"    },
  "Web App":          { provider: "Azure", label: "Web App",          entityRef: "dt.entity.azure_web_app",               cls: "managed"    },
  "Load Balancer":    { provider: "Azure", label: "Load Balancer",    entityRef: "dt.entity.azure_load_balancer",         cls: "managed"    },
  "Redis":            { provider: "Azure", label: "Redis",            entityRef: "dt.entity.azure_redis_cache",           cls: "managed"    },
  // GCP (namespace uses colons — backticks required in the entity reference)
  "Compute Engine":   { provider: "GCP",   label: "Compute Engine",   entityRef: "`dt.entity.cloud:gcp:gce_instance`",    cls: "hostBacked", hostCloudType: "GOOGLE_CLOUD_PLATFORM" },
  "Cloud Functions":  { provider: "GCP",   label: "Cloud Functions",  entityRef: "`dt.entity.cloud:gcp:cloud_function`", cls: "managed"    },
  "Cloud SQL":        { provider: "GCP",   label: "Cloud SQL",        entityRef: "`dt.entity.cloud:gcp:cloudsql_database`", cls: "managed" },
  "Cloud Storage":    { provider: "GCP",   label: "Cloud Storage",    entityRef: "`dt.entity.cloud:gcp:gcs_bucket`",     cls: "managed"    },
  "GKE":              { provider: "GCP",   label: "GKE",              entityRef: "`dt.entity.cloud:gcp:k8s_cluster`",    cls: "managed"    },
};

/**
 * Entity list for a cloud service tile drill-down.
 * Returns a DQL query that lists at most 200 entities of the given service
 * with universally-safe fields (`id`, `entity.name`). Sorting is by name so
 * the DataTable renders deterministically across runs.
 */
export const cloudServiceEntitiesQuery = (svcKey: string): string | null => {
  const meta = CLOUD_SERVICES[svcKey];
  if (!meta) return null;
  return `
fetch ${meta.entityRef}
| fields id, name = entity.name
| sort name asc
| limit 200
`.trim();
};

/**
 * List of CLOUD hosts belonging to a host-backed service (EC2 / Azure VM /
 * GCE with OneAgent). This is the "left side" of the join used by the
 * drill-down Sheet — hosts here appear even when they had no billing events
 * in the window (host present, cost 0).
 */
export const cloudHostsListQuery = (svcKey: string): string | null => {
  const meta = CLOUD_SERVICES[svcKey];
  if (!meta || meta.cls !== "hostBacked" || !meta.hostCloudType) return null;
  return `
fetch dt.entity.host
| filter cloudType == "${meta.hostCloudType}"
| fields id, name = entity.name
| sort name asc
| limit 200
`.trim();
};

/**
 * Billing quantities per (host, capability) for the CLOUD hosts of a
 * host-backed service. Deliberately does NOT restrict `event.type` so we
 * capture every capability that touches `dt.entity.host` — Full-Stack,
 * Infrastructure, Foundation & Discovery, Runtime Vulnerability, Runtime
 * Application Protection, Kubernetes Platform Monitoring, etc. The client
 * multiplies each row by the rate for that capability from the rate card,
 * summing per host — this is the ONLY correct way to price a cloud host
 * that carries multiple capabilities at once (e.g., a Full-Stack host that
 * also has Runtime Vulnerability enabled).
 *
 * IMPORTANT: this is the same billing quantity that populates the
 * Infrastructure & K8s tab. It is NOT double-billed by Dynatrace — the
 * Sheet renders a disclaimer stating this.
 */
export const cloudHostsBillingByCapQuery = (svcKey: string, tr: TimeRangeOption): string | null => {
  const meta = CLOUD_SERVICES[svcKey];
  if (!meta || meta.cls !== "hostBacked" || !meta.hostCloudType) return null;
  return `
fetch dt.system.events, from: ${tr.dqlFrom}, to: ${tr.dqlTo}
| filter event.kind == "BILLING_USAGE_EVENT" and isNotNull(dt.entity.host)
| summarize {
    gib_hours  = sum(coalesce(billed_gibibyte_hours, 0.0)),
    host_hours = sum(coalesce(billed_host_hours, 0.0)),
    pod_hours  = sum(coalesce(billed_pod_hours, 0.0))
  }, by: { id = dt.entity.host, cap = event.type }
| lookup [ fetch dt.entity.host | filter cloudType == "${meta.hostCloudType}" | fields id ], sourceField: id, lookupField: id
| filter isNotNull(lookup.id)
| fields id, cap, gib_hours, host_hours, pod_hours
| sort id asc
| limit 2000
`.trim();
};

/** @deprecated superseded by `cloudHostsListQuery` + `cloudHostsBillingByCapQuery`.
 *  Kept only to avoid breaking imports if any other page relies on this symbol. */
export const cloudHostCostByEntityQuery = cloudHostsListQuery;

/**
 * Metrics DPS billing — cloud-service metric consumption in DPS-priced tenants.
 *
 * On DPS-priced tenants `builtin:billing.ddu.metrics.byEntity`
 * is empty even with CloudWatch / Azure Monitor / Google Cloud integrations
 * actively ingesting. Instead, the billed quantity flows through
 * `Metrics - Ingest & Process` (`data_points`). This is aggregate — per-cloud-
 * service attribution requires integration-side dimensions and is not exposed
 * by billing, so the Cloud tab surfaces the total DPS consumption + a note.
 */
export const metricsDpsBillingQuery = (tr: TimeRangeOption) => `
fetch dt.system.events, from: ${tr.dqlFrom}, to: ${tr.dqlTo}
| filter event.kind == "BILLING_USAGE_EVENT" and event.type == "Metrics - Ingest & Process"
| summarize {
    data_points = sum(coalesce(data_points, 0)),
    events = count()
  }
`.trim();

// ── OVERVIEW TOTALS — current week ────────────────────────────────────────────

export const totalLogsTodayQuery = () => `
fetch logs, from:now()-24h, to:now()
| summarize total = count()
`.trim();

export const totalSpansTodayQuery = () => `
fetch spans, from:now()-24h, to:now()
| summarize total = count()
`.trim();

export const totalEventsTodayQuery = () => `
fetch events, from:now()-24h, to:now()
| summarize total = count()
`.trim();

export const totalHostsQuery = () => `
fetch dt.entity.host
| summarize total = count()
`.trim();

export const totalServicesQuery = () => `
fetch dt.entity.service
| summarize total = count()
`.trim();

// ── BILLING USAGE EVENTS ──────────────────────────────────────────────────────

/** Billing totals — single summary row */
export const billingTotalsQuery = (tr: TimeRangeOption) => `
fetch dt.system.events, from:${tr.dqlFrom}, to:${tr.dqlTo}
| filter event.kind == "BILLING_USAGE_EVENT"
| summarize {
  total_gib        = sum(coalesce(billed_bytes, 0.0) / 1073741824.0),
  total_gib_hours  = sum(coalesce(billed_gibibyte_hours, 0.0)),
  total_host_hours = sum(coalesce(billed_host_hours, 0.0)),
  total_events     = count(),
  capability_types = countDistinct(event.type)
}
`.trim();

/** Billing detail by event.type — for breakdown tables and cost calculation */
// Each capability exposes its billed quantity under a different field:
//   billed_bytes                 → logs/events/DEM/traces query (retain & query)
//   ingested_bytes               → Traces - Ingest & Process
//   billed_gibibyte_hours        → Full-Stack Monitoring
//   billed_host_hours            → Infrastructure Monitoring
//   data_points                  → Metrics - Ingest & Process
//   billed_synthetic_action_count→ Browser Monitor or Clickpath
//   billed_invocations           → AppEngine Functions
//   billed_sessions              → Real User Monitoring
export const billingDetailByTypeQuery = (tr: TimeRangeOption) => `
fetch dt.system.events, from:${tr.dqlFrom}, to:${tr.dqlTo}
| filter event.kind == "BILLING_USAGE_EVENT"
| summarize {
  data_gib          = sum((coalesce(billed_bytes, 0.0) + coalesce(ingested_bytes, 0.0)) / 1073741824.0),
  avg_gib           = avg((coalesce(billed_bytes, 0.0) + coalesce(ingested_bytes, 0.0)) / 1073741824.0),
  gib_hours         = sum(coalesce(billed_gibibyte_hours, 0.0)),
  pod_hours         = sum(coalesce(billed_pod_hours, 0.0)),
  host_hours        = sum(coalesce(billed_host_hours, 0.0)),
  host_unit_hours   = sum(coalesce(billed_gibibyte_hours, 0.0)) / 16.0,
  data_points       = sum(coalesce(data_points, 0)),
  synthetic_actions = sum(coalesce(billed_synthetic_action_count, 0)),
  http_requests     = sum(coalesce(billed_http_request_count, 0)),
  invocations       = sum(coalesce(billed_invocations, 0)),
  sessions          = sum(coalesce(billed_sessions, 0)),
  event_count       = count()
}, by: { event_type = event.type }
| sort data_gib desc
`.trim();

/** Hourly billing by capability — for time-series charts */
export const billingHourlyQuery = (tr: TimeRangeOption) => `
fetch dt.system.events, from:${tr.dqlFrom}, to:${tr.dqlTo}
| filter event.kind == "BILLING_USAGE_EVENT"
| fieldsAdd capability = coalesce(event.type, "unknown"), hour_bin = bin(timestamp, 1h)
| summarize {
  data_gib    = sum(coalesce(billed_bytes, 0.0) / 1073741824.0),
  gib_hours   = sum(coalesce(billed_gibibyte_hours, 0.0)),
  host_hours  = sum(coalesce(billed_host_hours, 0.0)),
  event_count = count()
}, by: { hour_bin, capability }
| sort hour_bin asc
`.trim();

/** Billing by capability group (legacy — kept for compatibility) */
export const billingByCapabilityQuery = (tr: TimeRangeOption) => `
fetch dt.system.events, from:${tr.dqlFrom}, to:${tr.dqlTo}
| filter event.kind == "BILLING_USAGE_EVENT"
| summarize {
  data_gib    = sum(coalesce(billed_bytes, 0.0) / 1073741824.0),
  gib_hours   = sum(coalesce(billed_gibibyte_hours, 0.0)),
  host_hours  = sum(coalesce(billed_host_hours, 0.0)),
  event_count = count()
}, by: { capability = event.type }
| sort data_gib desc
| limit 200
`.trim();

// ── BILLING TREND — daily GiB per capability for predictions ─────────────────

/** 30-day daily GiB + GiB-hours per capability — used for linear regression predictions */
export const billingDailyTrendQuery = () => `
fetch dt.system.events, from:now()-30d, to:now()
| filter event.kind == "BILLING_USAGE_EVENT"
| fieldsAdd day = bin(timestamp, 1d)
| summarize {
    data_gib  = sum(coalesce(billed_bytes, 0.0) / 1073741824.0),
    gib_hours = sum(coalesce(billed_gibibyte_hours, 0.0))
  }, by: { day, capability = event.type }
| sort day asc
`.trim();

/** Last 7-day average GiB/day per capability — quick baseline for projections */
export const billingBaselineQuery = () => `
fetch dt.system.events, from:now()-7d, to:now()
| filter event.kind == "BILLING_USAGE_EVENT"
| summarize {
    data_gib  = sum(coalesce(billed_bytes, 0.0) / 1073741824.0),
    gib_hours = sum(coalesce(billed_gibibyte_hours, 0.0)),
    event_count = count()
  }, by: { capability = event.type }
| sort data_gib desc
`.trim();

// ── APPLICATIONS (from dt.system.events — builtin:billing.* is empty here) ────

/**
 * Hourly billing activity for a single capability from dt.system.events.
 * `agg` chooses the measured quantity:
 *  - "gib_hours": sum of billed_gibibyte_hours (Full-Stack)
 *  - "gib":       sum of billed_bytes converted to GiB
 *  - "count":     number of billing usage events (activity proxy)
 */
export const capabilityHourlyQuery = (
  tr: TimeRangeOption,
  capability: string,
  agg: "gib_hours" | "gib" | "count",
) => {
  const measure =
    agg === "gib_hours" ? "sum(coalesce(billed_gibibyte_hours, 0.0))"
    : agg === "gib"      ? "sum(coalesce(billed_bytes, 0.0) / 1073741824.0)"
    :                      "count()";
  return `
fetch dt.system.events, from:${tr.dqlFrom}, to:${tr.dqlTo}
| filter event.kind == "BILLING_USAGE_EVENT" and event.type == "${capability}"
| summarize val = ${measure}, by: { interval = bin(timestamp, ${tr.binInterval}) }
| sort interval asc
`.trim();
};

export const logIngestGibHourlyQuery = (tr: TimeRangeOption) => capabilityHourlyQuery(tr, "Log Management & Analytics - Ingest & Process", "gib");
export const tracesIngestGibQuery    = (tr: TimeRangeOption) => capabilityHourlyQuery(tr, "Traces - Ingest & Process", "gib");
export const tracesQueryGibQuery     = (tr: TimeRangeOption) => capabilityHourlyQuery(tr, "Traces - Query", "gib");

export const rumActivityQuery       = (tr: TimeRangeOption) => capabilityHourlyQuery(tr, "Real User Monitoring",         "count");
export const syntheticActivityQuery = (tr: TimeRangeOption) => capabilityHourlyQuery(tr, "Browser Monitor or Clickpath", "count");
export const appEngineActivityQuery = (tr: TimeRangeOption) => capabilityHourlyQuery(tr, "AppEngine Functions - Small",  "count");
export const fullStackGibHoursQuery = (tr: TimeRangeOption) => capabilityHourlyQuery(tr, "Full-Stack Monitoring",        "gib_hours");

// ── PREVIOUS WEEK TOTALS (now()-14d → now()-7d) ───────────────────────────────

export const logsCountPrevWeekQuery = () => `
fetch logs, from:now()-14d, to:now()-7d
| summarize total = count()
`.trim();

// COST-OPTIMIZED: previous-week span total from dt.system.events (~0 GB scan).
export const spansCountPrevWeekQuery = () => `
fetch dt.system.events, from:now()-14d, to:now()-7d
| filter event.kind == "BILLING_USAGE_EVENT" and event.type == "Traces - Ingest & Process"
| summarize total = sum(coalesce(ingested_spans, 0))
`.trim();

export const eventsCountPrevWeekQuery = () => `
fetch events, from:now()-14d, to:now()-7d
| summarize total = count()
`.trim();

export const bizeventsCountPrevWeekQuery = () => `
fetch bizevents, from:now()-14d, to:now()-7d
| summarize total = count()
`.trim();
