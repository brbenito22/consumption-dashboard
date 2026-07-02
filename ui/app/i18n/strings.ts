export type Lang = "en" | "pt";

/**
 * Translatable EXPLANATORY text only (subtitles, info overlays, notes).
 * Capability names, units (GiB-hours, pod-hours), KPI titles and structural
 * labels stay in English — they mirror Dynatrace's official billing terms.
 * Use {var} placeholders; pass values via the second arg of t().
 */
export const STRINGS = {
  // ── Billing subtitle ──────────────────────────────────────────────────────
  "billing.subtitle": {
    en: "End-to-end cost over the last {window}, priced with the {source}. Currency: {currency}.",
    pt: "Custo de ponta a ponta nos últimos {window}, precificado com o {source}. Moeda: {currency}.",
  },
  "billing.source.account": { en: "Account rate card", pt: "rate card da conta" },
  "billing.source.default": { en: "Default rate card", pt: "rate card padrão" },

  // ── Official cost explanatory note (below the KPIs) ────────────────────────
  "billing.officialNote": {
    en: '"Dynatrace Official Cost" is the authoritative amount Dynatrace itself bills for the subscription (from the Platform Subscription API), covering its own billing period — so it is NOT comparable to "Cost (last {window})", which is only the selected window. The per-capability and per-offender figures are derived from Grail consumption × rate card to give granular attribution the billing API does not expose; we validated those quantities against Dynatrace\'s metering.',
    pt: 'O "Dynatrace Official Cost" é o valor autoritativo que o próprio Dynatrace fatura pela subscription (vindo da Platform Subscription API), cobrindo o período de faturamento dele — por isso NÃO é comparável ao "Cost (last {window})", que é apenas a janela selecionada. Os valores por capability e por ofensor vêm do consumo no Grail × rate card, dando a atribuição granular que a API de faturamento não expõe; validamos essas quantidades contra o metering do Dynatrace.',
  },

  // ── Projection info overlay ────────────────────────────────────────────────
  "info.projection.titleMonthly": {
    en: "How the monthly projection is calculated",
    pt: "Como a projeção mensal é calculada",
  },
  "info.projection.titleAnnual": {
    en: "How the annual projection is calculated",
    pt: "Como a projeção anual é calculada",
  },
  "info.projection.monthlyP1": {
    en: "The Monthly projection is your current run-rate: the real consumption cost over the last 30 days, normalized to a calendar month (730 hours).",
    pt: "A Monthly projection é o seu run-rate atual: o custo real de consumo nos últimos 30 dias, normalizado para um mês (730 horas).",
  },
  "info.projection.annualP1": {
    en: "The Annual projection is that monthly run-rate × 12 — your yearly spend if consumption stays at the level of the last 30 days.",
    pt: "A Annual projection é esse run-rate mensal × 12 — o gasto anual se o consumo se mantiver no nível dos últimos 30 dias.",
  },
  "info.projection.p2": {
    en: "It is a forward-looking estimate of spend if consumption stays at the recent level. Because it uses a fixed 30-day basis, it does not change when you switch the timeframe selector — only “Cost (last …)” reflects the selected window.",
    pt: "É uma estimativa futura de gasto se o consumo se mantiver no nível recente. Como usa uma base fixa de 30 dias, ela não muda quando você troca o timeframe — apenas “Cost (last …)” reflete a janela selecionada.",
  },
  "info.projection.p3": {
    en: "Estimate derived from Grail consumption × your account rate card — not a Dynatrace quote.",
    pt: "Estimativa derivada do consumo no Grail × o rate card da sua conta — não é uma cotação do Dynatrace.",
  },

  // ── Official cost info overlay ─────────────────────────────────────────────
  "info.official.title": {
    en: "What “Dynatrace Official Cost” means",
    pt: "O que é o “Dynatrace Official Cost”",
  },
  "info.official.p1": {
    en: "This is the authoritative cost Dynatrace itself computes and bills for your subscription, read directly from the Platform Subscription API (in {currency}).",
    pt: "É o custo autoritativo que o próprio Dynatrace calcula e fatura pela sua subscription, lido diretamente da Platform Subscription API (em {currency}).",
  },
  "info.official.p2": {
    en: "It covers Dynatrace’s own billing period{period}, which is not the timeframe you selected above. So it is not directly comparable to “Cost (last …)”, which only reflects the window you are viewing — compare them on the same number of days.",
    pt: "Ele cobre o período de faturamento do próprio Dynatrace{period}, que não é o timeframe que você selecionou acima. Por isso não é diretamente comparável ao “Cost (last …)”, que reflete apenas a janela que você está vendo — compare os dois na mesma quantidade de dias.",
  },
  "info.official.p3": {
    en: "Use this as the source of truth for what Dynatrace charges. The per-capability cards below break that spend down by capability, host and namespace — granularity the billing API does not expose — and their quantities were validated against Dynatrace’s own metering.",
    pt: "Use isto como fonte da verdade para o que o Dynatrace cobra. Os cards por capability abaixo detalham esse gasto por capability, host e namespace — granularidade que a API de faturamento não expõe — e suas quantidades foram validadas contra o próprio metering do Dynatrace.",
  },

  // ── KPI information overlays (per-capability ingest / consumption) ──────────
  // Observability — Logs
  "kpi.logRecords.title": { en: "Log Records", pt: "Log Records" },
  "kpi.logRecords.body": {
    en: "Number of log records ingested in the window. Logs are billed by ingested volume (GiB) under “Log Management & Analytics – Ingest & Process”, not by record count — see Log Ingest Volume for the billed amount.",
    pt: "Quantidade de registros de log ingeridos na janela. Logs são cobrados por volume ingerido (GiB) em “Log Management & Analytics – Ingest & Process”, não por número de registros — veja o Log Ingest Volume para o valor cobrado.",
  },
  "kpi.logIngestVolume.title": { en: "Log Ingest Volume", pt: "Log Ingest Volume" },
  "kpi.logIngestVolume.body": {
    en: "Billed log ingest volume (GiB). This is the quantity that “Log Management & Analytics – Ingest & Process” is priced on (price per GiB on your rate card).",
    pt: "Volume de ingestão de logs cobrado (GiB). É sobre esta quantidade que o “Log Management & Analytics – Ingest & Process” é precificado (preço por GiB no seu rate card).",
  },
  "kpi.logBillingCost.title": { en: "Log Billing Cost", pt: "Custo de Billing de Logs" },
  "kpi.logBillingCost.body": {
    en: "Combined log cost in the window: ingest (GiB) + query (GiB scanned) + retain (GiB-days), each priced with your account rate card.",
    pt: "Custo total de logs na janela: ingest (GiB) + query (GiB varridos) + retain (GiB-dias), cada um precificado com o rate card da sua conta.",
  },
  // Observability — Traces
  "kpi.spansIngested.title": { en: "Spans Ingested", pt: "Spans Ingested" },
  "kpi.spansIngested.body": {
    en: "Number of trace spans ingested. Tracing is billed by ingested volume (GiB) under “Traces – Ingest & Process”, not by span count.",
    pt: "Quantidade de spans de trace ingeridos. Tracing é cobrado por volume ingerido (GiB) em “Traces – Ingest & Process”, não por número de spans.",
  },
  "kpi.traceQueryVolume.title": { en: "Trace Query Volume", pt: "Trace Query Volume" },
  "kpi.traceQueryVolume.body": {
    en: "Volume of trace data scanned by queries (GiB), billed under “Traces – Query” (price per GiB scanned).",
    pt: "Volume de dados de trace varridos por consultas (GiB), cobrado em “Traces – Query” (preço por GiB varrido).",
  },
  "kpi.traceBillingCost.title": { en: "Trace Billing Cost", pt: "Custo de Billing de Traces" },
  "kpi.traceBillingCost.body": {
    en: "Combined tracing cost: ingest (GiB) + query (GiB scanned), priced with your account rate card.",
    pt: "Custo total de tracing: ingest (GiB) + query (GiB varridos), precificado com o rate card da sua conta.",
  },
  // Observability — Events
  "kpi.events.title": { en: "Events", pt: "Events" },
  "kpi.events.body": {
    en: "Number of events ingested in the window. Billed by ingested volume under “Events – Ingest & Process”.",
    pt: "Quantidade de eventos ingeridos na janela. Cobrado por volume ingerido em “Events – Ingest & Process”.",
  },
  "kpi.eventsBillingCost.title": { en: "Events Billing Cost", pt: "Custo de Billing de Events" },
  "kpi.eventsBillingCost.body": {
    en: "Combined events cost: ingest + query + retain, priced with your account rate card.",
    pt: "Custo total de eventos: ingest + query + retain, precificado com o rate card da sua conta.",
  },
  "kpi.businessEvents.title": { en: "Business Events", pt: "Business Events" },
  "kpi.businessEvents.body": {
    en: "Number of business events (bizevents) ingested in the window.",
    pt: "Quantidade de business events (bizevents) ingeridos na janela.",
  },
  // Applications
  "kpi.rumCost.title": { en: "RUM Cost", pt: "Custo de RUM" },
  "kpi.rumCost.body": {
    en: "Real User Monitoring cost — billed per user session under “Real User Monitoring”.",
    pt: "Custo de Real User Monitoring — cobrado por sessão de usuário em “Real User Monitoring”.",
  },
  "kpi.syntheticCost.title": { en: "Synthetic Cost", pt: "Custo de Synthetic" },
  "kpi.syntheticCost.body": {
    en: "Synthetic monitoring cost — billed per synthetic action (Browser Monitor / Clickpath).",
    pt: "Custo de monitoramento sintético — cobrado por ação sintética (Browser Monitor / Clickpath).",
  },
  "kpi.appEngineCost.title": { en: "AppEngine Cost", pt: "Custo de AppEngine" },
  "kpi.appEngineCost.body": {
    en: "AppEngine Functions cost — billed per function invocation.",
    pt: "Custo de AppEngine Functions — cobrado por invocação de função.",
  },
  // Infrastructure
  "kpi.totalHosts.title": { en: "Total Monitored Hosts", pt: "Total de Hosts Monitorados" },
  "kpi.totalHosts.body": {
    en: "Hosts monitored by OneAgent (Full-Stack + Infrastructure modes).",
    pt: "Hosts monitorados pelo OneAgent (modos Full-Stack + Infrastructure).",
  },
  "kpi.fullStackHosts.title": { en: "Full Stack Monitoring", pt: "Full Stack Monitoring" },
  "kpi.fullStackHosts.body": {
    en: "Hosts with Full-Stack monitoring — billed per memory-gibibyte-hour under “Full-Stack Monitoring”.",
    pt: "Hosts com monitoramento Full-Stack — cobrados por memory-gibibyte-hour em “Full-Stack Monitoring”.",
  },
  "kpi.infraHosts.title": { en: "Infrastructure Monitoring", pt: "Infrastructure Monitoring" },
  "kpi.infraHosts.body": {
    en: "Hosts with Infrastructure-only monitoring — billed per host-hour under “Infrastructure Monitoring”.",
    pt: "Hosts com monitoramento apenas de Infraestrutura — cobrados por host-hour em “Infrastructure Monitoring”.",
  },
  "kpi.fleetCpu.title": { en: "Fleet Avg CPU", pt: "CPU Média da Frota" },
  "kpi.fleetCpu.body": {
    en: "Average CPU utilization across hosts reporting in the window. An efficiency signal (rightsizing) — it is not billed.",
    pt: "Utilização média de CPU entre os hosts que reportaram na janela. Indicador de eficiência (rightsizing) — não é cobrado.",
  },
  "kpi.hostLicenseCost.title": { en: "Host License Cost", pt: "Custo de Licença de Hosts" },
  "kpi.hostLicenseCost.body": {
    en: "Host monitoring license cost: Full-Stack (GiB-hours) + Infrastructure (host-hours), priced with your rate card.",
    pt: "Custo de licença de monitoramento de hosts: Full-Stack (GiB-hours) + Infrastructure (host-hours), precificado com o seu rate card.",
  },
  "kpi.virtualMachines.title": { en: "Virtual Machines", pt: "Máquinas Virtuais" },
  "kpi.virtualMachines.body": {
    en: "Hypervisor-managed virtual machines detected in the environment.",
    pt: "Máquinas virtuais gerenciadas por hypervisor detectadas no ambiente.",
  },
  "kpi.k8sClusters.title": { en: "Kubernetes Clusters", pt: "Clusters Kubernetes" },
  "kpi.k8sClusters.body": {
    en: "Monitored Kubernetes clusters. Cluster nodes are billed as Full-Stack hosts.",
    pt: "Clusters Kubernetes monitorados. Os nodes do cluster são cobrados como hosts Full-Stack.",
  },
  "kpi.k8sNodes.title": { en: "Nodes", pt: "Nodes" },
  "kpi.k8sNodes.body": {
    en: "Cluster nodes. Each node is a host billed under “Full-Stack Monitoring” (memory-GiB-hours).",
    pt: "Nodes do cluster. Cada node é um host cobrado em “Full-Stack Monitoring” (memory-GiB-hours).",
  },
  "kpi.k8sPods.title": { en: "Pods", pt: "Pods" },
  "kpi.k8sPods.body": {
    en: "Running pods. Pods on Full-Stack nodes are already covered; only pods outside Full-Stack accrue pod-hours under “Kubernetes Platform Monitoring”.",
    pt: "Pods em execução. Pods em nodes Full-Stack já estão cobertos; apenas pods fora de Full-Stack geram pod-hours em “Kubernetes Platform Monitoring”.",
  },
  "kpi.k8sWorkloads.title": { en: "Workloads", pt: "Workloads" },
  "kpi.k8sWorkloads.body": {
    en: "Workloads (deployments, statefulsets, etc.). Not billed directly — covered by their nodes’ Full-Stack license.",
    pt: "Workloads (deployments, statefulsets, etc.). Não são cobrados diretamente — cobertos pela licença Full-Stack dos seus nodes.",
  },
  "kpi.k8sNamespaces.title": { en: "Namespaces", pt: "Namespaces" },
  "kpi.k8sNamespaces.body": {
    en: "Kubernetes namespaces. Not billed directly; used here to attribute node cost by pod share.",
    pt: "Namespaces do Kubernetes. Não são cobrados diretamente; usados aqui para atribuir o custo dos nodes pela fração de pods.",
  },
  "kpi.nodeLicenseCost.title": { en: "Node License Cost", pt: "Custo de Licença dos Nodes" },
  "kpi.nodeLicenseCost.body": {
    en: "Full-Stack license cost of the cluster nodes (K8s nodes are billed as Full-Stack hosts).",
    pt: "Custo de licença Full-Stack dos nodes do cluster (nodes K8s são cobrados como hosts Full-Stack).",
  },
  // Cloud tab — page subtitle
  "cloud.subtitle": {
    en: "Cloud provider footprint and managed services monitored by Dynatrace. Host and Kubernetes license cost lives in the Infrastructure & K8s tab.",
    pt: "Footprint dos provedores de cloud e serviços gerenciados monitorados pelo Dynatrace. Custo de licença de host e Kubernetes vive na aba Infrastructure & K8s.",
  },
  // Cloud integration section (legacy — kept for compat with any other consumer)
  "cloud.integrationTitle": { en: "Cloud Integration Consumption & Cost", pt: "Consumo e Custo da Integração de Cloud" },
  "cloud.serviceMetricTitle": { en: "Cloud Service Metric Consumption (DDU) by service", pt: "Consumo de Métricas de Serviços de Cloud (DDU) por serviço" },
  "cloud.costNote": {
    en: "This tab covers the direct cloud integration (AWS CloudWatch / Azure Monitor / Google Cloud). Connected cloud services (RDS, Lambda, S3, etc.) carry no OneAgent and are billed by the metric data points they ingest — there is no per-service billing SKU. Cloud VMs/hosts that run OneAgent (EC2 / Azure VM / GCE) are NOT shown here to avoid double counting: their Full-Stack / Infrastructure cost is in the Infrastructure & K8s tab.",
    pt: "Esta aba cobre a integração direta de cloud (AWS CloudWatch / Azure Monitor / Google Cloud). Os serviços de cloud conectados (RDS, Lambda, S3, etc.) não têm OneAgent e são cobrados pelos data points de métrica que ingerem — não existe SKU de billing por serviço. VMs/hosts de cloud que rodam OneAgent (EC2 / Azure VM / GCE) NÃO aparecem aqui para evitar dupla contagem: o custo Full-Stack / Infrastructure deles está na aba Infrastructure & K8s.",
  },
  // Cloud metrics (DPS billing) section — new
  "cloud.metricsTitle": {
    en: "Cloud metrics — billed as “Metrics - Ingest & Process”",
    pt: "Métricas de cloud — cobradas como “Metrics - Ingest & Process”",
  },
  "cloud.metricsNote": {
    en: "In DPS-priced tenants, cloud-service metric consumption (CloudWatch, Azure Monitor, Google Cloud) is billed via “Metrics - Ingest & Process” (data_points) — not via DDU. This aggregate is the direct cost signal for the integration; per-cloud-service attribution requires integration-side dimensions that billing does not expose. Cloud host cost (OneAgent Full-Stack / Infrastructure) remains attributed on the Infrastructure & K8s tab.",
    pt: "Em tenants DPS, o consumo de métricas dos serviços de cloud (CloudWatch, Azure Monitor, Google Cloud) é cobrado via “Metrics - Ingest & Process” (data_points) — não via DDU. Esse agregado é o sinal direto de custo da integração; atribuição por serviço de cloud requer dimensões da integração que o billing não expõe. O custo de host de cloud (OneAgent Full-Stack / Infrastructure) continua atribuído na aba Infrastructure & K8s.",
  },
  // Existing empty-state note (kept for compat) — shown when NO providers show inventory
  "cloud.noIntegration": {
    en: "No cloud integration is connected yet. Connect AWS CloudWatch, Azure Monitor or Google Cloud and the monitored services and their metric consumption will populate here automatically. Cloud host (OneAgent) cost stays in the Infrastructure & K8s tab.",
    pt: "Nenhuma integração de cloud conectada ainda. Conecte AWS CloudWatch, Azure Monitor ou Google Cloud e os serviços monitorados e seu consumo de métricas vão popular aqui automaticamente. O custo de host de cloud (OneAgent) permanece na aba Infrastructure & K8s.",
  },
  // Root-level empty state (shown at top of Cloud tab, above metrics section)
  "cloud.noIntegrationRoot": {
    en: "No cloud provider integration is currently active in this environment. Connect AWS (CloudWatch / metric streams), Azure Monitor or Google Cloud, or deploy OneAgent on cloud hosts, and their instances, services and consumption will populate automatically.",
    pt: "Nenhuma integração de provedor de cloud está ativa neste ambiente. Conecte AWS (CloudWatch / metric streams), Azure Monitor ou Google Cloud, ou instale OneAgent em hosts de cloud, e as instâncias, serviços e consumo aparecerão automaticamente.",
  },
  // ── Cloud service drill-down sheet ────────────────────────────────────────
  "cloud.sheet.entities": { en: "Entities", pt: "Entidades" },
  "cloud.sheet.close":    { en: "Close",    pt: "Fechar"    },
  "cloud.sheet.empty": {
    en: "No entities for this service in the current tenant.",
    pt: "Sem entidades para este serviço no tenant atual.",
  },
  "cloud.sheet.errorLoading": {
    en: "Could not load entities for this service.",
    pt: "Não foi possível carregar as entidades deste serviço.",
  },
  "cloud.sheet.noteHostBacked": {
    en: "Hosts backed by OneAgent (EC2 / Azure VM / GCE). Their per-host billing (Full-Stack GiB-hours or Infrastructure host-hours × rate card) is already attributed on the Infrastructure & K8s tab — this drill-down deliberately omits a cost column to avoid double counting.",
    pt: "Hosts com OneAgent (EC2 / Azure VM / GCE). O billing por host (Full-Stack GiB-horas ou Infrastructure host-horas × rate card) já está atribuído na aba Infrastructure & K8s — esta drill-down omite a coluna de custo de propósito para não duplicar contagem.",
  },
  "cloud.sheet.noteManaged": {
    en: "Managed service monitored via the cloud provider integration (CloudWatch / Azure Monitor / Google Cloud). There is no per-service billing SKU: metric consumption is billed as “Metrics - Ingest & Process” aggregate — see the Cloud metrics section above for the total.",
    pt: "Serviço gerenciado monitorado pela integração do provedor (CloudWatch / Azure Monitor / Google Cloud). Não existe SKU de billing por serviço: o consumo de métricas é cobrado como agregado “Metrics - Ingest & Process” — veja a seção de Cloud metrics acima para o total.",
  },
  // Cloud
  "kpi.totalCloudInstances.title": { en: "Total Cloud Instances", pt: "Total de Instâncias Cloud" },
  "kpi.totalCloudInstances.body": {
    en: "Compute instances monitored across AWS, Azure and GCP. Cloud hosts are billed by their host monitoring mode (Full-Stack / Infrastructure).",
    pt: "Instâncias de compute monitoradas em AWS, Azure e GCP. Hosts de cloud são cobrados pelo modo de monitoramento (Full-Stack / Infrastructure).",
  },
  "kpi.awsInstances.title": { en: "AWS Instances", pt: "Instâncias AWS" },
  "kpi.awsInstances.body": {
    en: "Amazon EC2 instances monitored. Billing follows each host’s monitoring mode.",
    pt: "Instâncias Amazon EC2 monitoradas. A cobrança segue o modo de monitoramento de cada host.",
  },
  "kpi.azureVms.title": { en: "Azure VMs", pt: "VMs Azure" },
  "kpi.azureVms.body": {
    en: "Microsoft Azure virtual machines monitored. Billing follows each host’s monitoring mode.",
    pt: "Máquinas virtuais Microsoft Azure monitoradas. A cobrança segue o modo de monitoramento de cada host.",
  },
  "kpi.gcpInstances.title": { en: "GCP Instances", pt: "Instâncias GCP" },
  "kpi.gcpInstances.body": {
    en: "Google Cloud compute instances monitored. Billing follows each host’s monitoring mode.",
    pt: "Instâncias de compute do Google Cloud monitoradas. A cobrança segue o modo de monitoramento de cada host.",
  },
  // Overview (rates)
  "kpi.logRecordsPerHour.title": { en: "Log Records / Hour", pt: "Log Records / Hora" },
  "kpi.logRecordsPerHour.body": {
    en: "Average log records ingested per hour. Logs are billed by ingested volume (GiB), not record count.",
    pt: "Média de registros de log ingeridos por hora. Logs são cobrados por volume ingerido (GiB), não por número de registros.",
  },
  "kpi.spansPerHour.title": { en: "Trace Spans / Hour", pt: "Trace Spans / Hora" },
  "kpi.spansPerHour.body": {
    en: "Average trace spans ingested per hour. Tracing is billed by ingested volume (GiB).",
    pt: "Média de spans de trace ingeridos por hora. Tracing é cobrado por volume ingerido (GiB).",
  },
  "kpi.eventsPerHour.title": { en: "Events / Hour", pt: "Events / Hora" },
  "kpi.eventsPerHour.body": {
    en: "Average events ingested per hour. Billed by ingested volume.",
    pt: "Média de eventos ingeridos por hora. Cobrado por volume ingerido.",
  },
  "kpi.bizPerHour.title": { en: "Business Events / Hour", pt: "Business Events / Hora" },
  "kpi.bizPerHour.body": {
    en: "Average business events (bizevents) ingested per hour.",
    pt: "Média de business events (bizevents) ingeridos por hora.",
  },
  "kpi.monitoredHosts.title": { en: "Monitored Hosts", pt: "Hosts Monitorados" },
  "kpi.monitoredHosts.body": {
    en: "Hosts monitored by OneAgent. Billed per host by monitoring mode (Full-Stack / Infrastructure).",
    pt: "Hosts monitorados pelo OneAgent. Cobrados por host conforme o modo (Full-Stack / Infrastructure).",
  },
  "kpi.monitoredServices.title": { en: "Monitored Services", pt: "Serviços Monitorados" },
  "kpi.monitoredServices.body": {
    en: "Detected services. Services are not billed directly — their underlying hosts and tracing volume are.",
    pt: "Serviços detectados. Serviços não são cobrados diretamente — o que é cobrado são os hosts subjacentes e o volume de tracing.",
  },
} as const;

export type StringKey = keyof typeof STRINGS;
