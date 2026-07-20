import type { Lang } from "../i18n/strings";
import { normalizeCapabilityName } from "./rateCard";

/**
 * Plain-language "where does this cost come from" descriptions, per
 * capability, in EN and PT. Keyed by normalizeCapabilityName(capability).
 * Shown on Billing cards, on the per-tab cost panels and inside the
 * capability drill-down sheet — the goal is that a non-Dynatrace-expert
 * can read WHERE the money goes without a glossary.
 */
interface CapInfo {
  en: string;
  pt: string;
}

const INFO: Record<string, CapInfo> = {
  [normalizeCapabilityName("Full-Stack Monitoring")]: {
    en: "Hosts monitored with OneAgent in full-stack mode. Billed per GiB-hour of host memory — grows with the number and size of monitored hosts, NOT with traffic.",
    pt: "Hosts monitorados com OneAgent em modo full-stack. Cobrado por GiB-hora de memória do host — cresce com a quantidade e o tamanho dos hosts monitorados, NÃO com o tráfego.",
  },
  [normalizeCapabilityName("Infrastructure Monitoring")]: {
    en: "Hosts in infrastructure-only mode (no code-level tracing). Billed per host-hour.",
    pt: "Hosts em modo infrastructure-only (sem tracing de código). Cobrado por host-hora.",
  },
  [normalizeCapabilityName("Traces - Ingest & Process")]: {
    en: "Spans sent by your applications (OneAgent + OpenTelemetry). Grows with traffic and instrumentation depth. Reduce with sampling at the source.",
    pt: "Spans enviados pelas suas aplicações (OneAgent + OpenTelemetry). Cresce com tráfego e profundidade de instrumentação. Reduza com sampling na origem.",
  },
  [normalizeCapabilityName("Traces - Retain")]: {
    en: "Trace volume kept in storage. Billed per GiB-day of what is ALREADY stored — reacts slowly to ingest cuts (only as old data expires).",
    pt: "Volume de traces mantido em armazenamento. Cobrado por GiB-dia do que JÁ está armazenado — reage devagar a cortes de ingest (só conforme o dado antigo expira).",
  },
  [normalizeCapabilityName("Traces - Query")]: {
    en: "GiB scanned when people or apps query trace data (dashboards, notebooks, API). Driven by usage, not by ingestion.",
    pt: "GiB escaneados quando pessoas ou apps consultam traces (dashboards, notebooks, API). Puxado pelo uso, não pela ingestão.",
  },
  [normalizeCapabilityName("Log Management & Analytics - Ingest & Process")]: {
    en: "Log volume ingested from hosts, Kubernetes and apps. Grows with log verbosity — filter noisy logs in OpenPipeline to reduce.",
    pt: "Volume de logs ingerido de hosts, Kubernetes e aplicações. Cresce com a verbosidade dos logs — filtre logs ruidosos no OpenPipeline para reduzir.",
  },
  [normalizeCapabilityName("Log Management & Analytics - Retain")]: {
    en: "Log volume kept in storage, billed per GiB-day. Reduce with shorter-retention buckets for low-value logs.",
    pt: "Volume de logs armazenado, cobrado por GiB-dia. Reduza com buckets de retenção menor para logs de baixo valor.",
  },
  [normalizeCapabilityName("Log Management & Analytics - Query")]: {
    en: "GiB scanned by log queries (dashboards, notebooks, alerts). Narrow timeframes and filters make queries cheaper.",
    pt: "GiB escaneados por consultas de log (dashboards, notebooks, alertas). Janelas curtas e filtros deixam as consultas mais baratas.",
  },
  [normalizeCapabilityName("Events - Ingest & Process")]: {
    en: "Events ingested (Davis, Kubernetes, custom, business events). Watch for apps sending logs disguised as events.",
    pt: "Eventos ingeridos (Davis, Kubernetes, custom, business events). Atenção a apps enviando logs disfarçados de eventos.",
  },
  [normalizeCapabilityName("Events - Retain")]: {
    en: "Event volume kept in storage, per GiB-day.",
    pt: "Volume de eventos armazenado, por GiB-dia.",
  },
  [normalizeCapabilityName("Events - Query")]: {
    en: "GiB scanned by event queries (problem screens, dashboards).",
    pt: "GiB escaneados por consultas de eventos (telas de problema, dashboards).",
  },
  [normalizeCapabilityName("Metrics - Ingest & Process")]: {
    en: "Metric data points ingested (built-in, custom, cloud integrations like CloudWatch/Azure Monitor). Grows with metric count × dimensions.",
    pt: "Data points de métricas ingeridos (built-in, custom, integrações cloud como CloudWatch/Azure Monitor). Cresce com quantidade de métricas × dimensões.",
  },
  [normalizeCapabilityName("Real User Monitoring")]: {
    en: "Real user sessions captured in browsers and mobile apps. Billed per session.",
    pt: "Sessões de usuários reais capturadas em browsers e apps mobile. Cobrado por sessão.",
  },
  [normalizeCapabilityName("Browser Monitor or Clickpath")]: {
    en: "Synthetic browser tests executing on a schedule. Billed per synthetic action — frequency × steps × locations.",
    pt: "Testes sintéticos de browser executando em agenda. Cobrado por ação sintética — frequência × passos × localidades.",
  },
  [normalizeCapabilityName("HTTP Monitor")]: {
    en: "Synthetic HTTP checks. Billed per request — frequency × locations.",
    pt: "Checagens HTTP sintéticas. Cobrado por requisição — frequência × localidades.",
  },
  [normalizeCapabilityName("AppEngine Functions - Small")]: {
    en: "Serverless functions run by custom apps and integrations on the Dynatrace platform (including this app's rate-card fetch).",
    pt: "Funções serverless executadas por apps customizados e integrações na plataforma Dynatrace (incluindo a busca de rate card deste app).",
  },
  [normalizeCapabilityName("Kubernetes Platform Monitoring")]: {
    en: "Kubernetes cluster observability (nodes, workloads, events). Billed per pod-hour.",
    pt: "Observabilidade de clusters Kubernetes (nodes, workloads, eventos). Cobrado por pod-hora.",
  },
  [normalizeCapabilityName("Runtime Vulnerability Analytics")]: {
    en: "Security: runtime vulnerability detection on monitored workloads. Billed per GiB-hour of the covered hosts.",
    pt: "Segurança: detecção de vulnerabilidades em runtime nos workloads monitorados. Cobrado por GiB-hora dos hosts cobertos.",
  },
  [normalizeCapabilityName("Runtime Application Protection")]: {
    en: "Security: runtime attack blocking on monitored workloads. Billed per GiB-hour of the covered hosts.",
    pt: "Segurança: bloqueio de ataques em runtime nos workloads monitorados. Cobrado por GiB-hora dos hosts cobertos.",
  },
  [normalizeCapabilityName("Foundation & Discovery")]: {
    en: "Lightweight discovery mode for hosts without deep monitoring.",
    pt: "Modo leve de descoberta para hosts sem monitoramento profundo.",
  },
  [normalizeCapabilityName("Kubernetes Monitoring")]: {
    en: "Kubernetes observability billed per pod-hour.",
    pt: "Observabilidade Kubernetes cobrada por pod-hora.",
  },
  [normalizeCapabilityName("Digital Experience Monitoring - Query")]: {
    en: "GiB scanned by queries over RUM/session data.",
    pt: "GiB escaneados por consultas sobre dados de RUM/sessões.",
  },
  [normalizeCapabilityName("Automation Workflow")]: {
    en: "Workflow executions in the Automation engine. Billed per run.",
    pt: "Execuções de workflows no motor de Automation. Cobrado por execução.",
  },
  [normalizeCapabilityName("Code Monitoring")]: {
    en: "Live Debugger / code-level monitoring on enabled containers. Billed per container-hour while the capability is active — disable it on workloads you are not debugging.",
    pt: "Live Debugger / monitoramento a nível de código nos containers habilitados. Cobrado por container-hora enquanto ativo — desabilite nos workloads que não estão em debug.",
  },
};

const FALLBACK: CapInfo = {
  en: "Dynatrace platform capability — consumption metered by billing usage events.",
  pt: "Capability da plataforma Dynatrace — consumo medido pelos billing usage events.",
};

/** Friendly one-line description of where a capability's cost comes from. */
export function descriptionFor(capabilityName: string, lang: Lang): string {
  const info = INFO[normalizeCapabilityName(capabilityName)] ?? FALLBACK;
  return lang === "pt" ? info.pt : info.en;
}

/** Capability-name prefixes relevant to each tab's cost panel. */
export const TAB_CAPABILITY_PREFIXES: Record<string, string[]> = {
  observability: ["Log Management", "Traces", "Events", "Business Events"],
  applications: ["Real User Monitoring", "Browser Monitor", "HTTP Monitor", "AppEngine", "Digital Experience"],
  infrastructure: ["Full-Stack", "Infrastructure", "Kubernetes", "Foundation", "Runtime"],
  cloud: ["Full-Stack", "Infrastructure", "Metrics"],
};

/** Predicate builder: capability belongs to the given tab. */
export function tabIncludes(tab: keyof typeof TAB_CAPABILITY_PREFIXES): (cap: string) => boolean {
  const prefixes = TAB_CAPABILITY_PREFIXES[tab] ?? [];
  return (cap: string) => prefixes.some((p) => cap.toLowerCase().startsWith(p.toLowerCase()));
}
