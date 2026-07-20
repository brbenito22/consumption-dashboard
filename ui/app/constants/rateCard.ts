/**
 * Rate card types and the Dynatrace default rate card.
 *
 * The rate card is fetched from the environment's Account Management API
 * (capability prices from the customer's purchase order). On trial/sprint
 * tenants the API returns an empty list, so this default rate card
 * (https://www.dynatrace.com/pricing/rate-card/) is used as fallback.
 *
 * `price` is already normalized to the per-unit price (USD per single unit
 * of `quotedUnitOfMeasure`), so cost = quantity × price.
 */

export type RateCardType = "account" | "default";

export interface RateCardCapability {
  key: string;
  name: string;
  quotedPrice: string;
  quotedUnitOfMeasure: string;
  /** USD per single unit of measure (normalized). */
  price: string;
}

export interface RateCardResponse {
  quoteNumber: string;
  startTime: string;
  endTime: string;
  currencyCode: string;
  capabilities: RateCardCapability[];
}

/** Authoritative cost from the Platform Subscription API (Dynatrace-computed). */
export interface OfficialCost {
  total: number;
  currency: string;
  subscriptionId: string;
  /** Earliest date covered by the cost rows (ISO/yyyy-mm-dd), when present. */
  periodFrom?: string;
  /** Latest date covered by the cost rows (ISO/yyyy-mm-dd), when present. */
  periodTo?: string;
}

/**
 * OFFICIAL per-capability cost parsed from the Subscription API cost rows —
 * the same source Account Management's capability table reads. When present,
 * the app displays these values verbatim (exact AM match by construction) and
 * keeps Grail×rate-card estimation only for trends and drill-downs.
 */
export interface OfficialCapabilityCost {
  name: string;
  /** Total cost over the subscription's billing period to date. */
  periodTotal: number;
  /** Cost over the trailing 30 days (null when rows lack time granularity). */
  last30: number | null;
  /** Cost over the 30 days before that (null when unavailable). */
  prev30: number | null;
}

/** Lookup map keyed by normalizeCapabilityName(name). */
export function buildOfficialByCap(
  list: OfficialCapabilityCost[] | undefined | null,
): Map<string, OfficialCapabilityCost> {
  const m = new Map<string, OfficialCapabilityCost>();
  for (const c of list ?? []) m.set(normalizeCapabilityName(c.name), c);
  return m;
}

/** Annual commitment (budget) of the subscription — mirrors Account Management's "Budget summary". */
export interface OfficialBudget {
  /** Annual commitment amount in the subscription currency. */
  commitment: number;
  /** Subscription (commitment) period bounds, ISO yyyy-mm-dd when known. */
  periodStart?: string;
  periodEnd?: string;
  /** "api" when read from the Subscription API, "settings" when entered manually. */
  source: "api" | "settings";
}

/** App-function response shape. */
export interface RateCardFunctionResponse {
  error?: string;
  data?: RateCardResponse[];
  /** "account" when fetched from Account Management, "default" otherwise. */
  source?: RateCardType;
  /** Authoritative total cost from the Subscription API, when available. */
  officialCost?: OfficialCost;
  /** Diagnostic describing why the official cost is / isn't available. */
  officialCostDiag?: string;
  /** Annual commitment (budget) — API-discovered or manually configured. */
  officialBudget?: OfficialBudget;
  /** Official per-capability costs from the Subscription API, when exposed. */
  officialCapabilityCosts?: OfficialCapabilityCost[];
}

const PER_GIBI_HOURS = "Per 100,000 memory-gibibyte-hours";

export const defaultRateCard: RateCardResponse[] = [
  {
    quoteNumber: "default",
    startTime: "2020-01-01T00:00:00Z",
    endTime: "2050-12-31T23:59:59Z",
    currencyCode: "USD",
    capabilities: [
      { key: "FULLSTACK_MONITORING",        name: "Full-Stack Monitoring",                       quotedPrice: "1000",  quotedUnitOfMeasure: PER_GIBI_HOURS,                              price: "0.01"    },
      { key: "INFRASTRUCTURE_MONITORING",   name: "Infrastructure Monitoring",                   quotedPrice: "4000",  quotedUnitOfMeasure: "Per 100,000 host-hours",                    price: "0.04"    },
      { key: "FOUNDATION_AND_DISCOVERY",    name: "Foundation & Discovery",                      quotedPrice: "1000",  quotedUnitOfMeasure: "Per 100,000 host-hours",                    price: "0.01"    },
      { key: "KUBERNETES_OPERATIONS",       name: "Kubernetes Platform Monitoring",              quotedPrice: "200",   quotedUnitOfMeasure: "Per 100,000 pod-hours",                     price: "0.002"   },
      { key: "RUNTIME_VULNERABILITY",       name: "Runtime Vulnerability Analytics",             quotedPrice: "225",   quotedUnitOfMeasure: PER_GIBI_HOURS,                              price: "0.00225" },
      { key: "RUNTIME_APP_PROTECTION",      name: "Runtime Application Protection",              quotedPrice: "225",   quotedUnitOfMeasure: PER_GIBI_HOURS,                              price: "0.00225" },
      { key: "USER_SESSIONS",               name: "Real User Monitoring",                        quotedPrice: "225",   quotedUnitOfMeasure: "Per 100,000 sessions",                      price: "0.00225" },
      { key: "USER_SESSION_REPLAYS",        name: "Real User Monitoring with Session Replay",    quotedPrice: "450",   quotedUnitOfMeasure: "Per 100,000 session replay captures",       price: "0.0045"  },
      { key: "SYNTHETIC_BROWSER",           name: "Browser Monitor or Clickpath",                quotedPrice: "450",   quotedUnitOfMeasure: "Per 100,000 synthetic actions",             price: "0.0045"  },
      { key: "SYNTHETIC_HTTP",              name: "HTTP Monitor",                                quotedPrice: "100",   quotedUnitOfMeasure: "Per 100,000 synthetic requests",            price: "0.001"   },
      { key: "AUTOMATIONS",                 name: "Automation Workflow",                         quotedPrice: "300",   quotedUnitOfMeasure: "Per 10,000 workflow-hours",                 price: "0.03"    },
      { key: "LOG_MANAGEMENT_INGEST",       name: "Log Management & Analytics - Ingest & Process", quotedPrice: "2000", quotedUnitOfMeasure: "Per 10,000 gibibytes",                    price: "0.20"    },
      { key: "LOG_MANAGEMENT_ANALYZE",      name: "Log Management & Analytics - Query",          quotedPrice: "3500",  quotedUnitOfMeasure: "Per 1,000,000 gibibytes-scanned",           price: "0.0035"  },
      { key: "LOG_MANAGEMENT_RETAIN",       name: "Log Management & Analytics - Retain",         quotedPrice: "700",   quotedUnitOfMeasure: "Per 1,000,000 gibibyte-days",               price: "0.0007"  },
      { key: "EVENTS_INGEST",               name: "Events - Ingest & Process",                   quotedPrice: "2000",  quotedUnitOfMeasure: "Per 10,000 gibibytes",                      price: "0.20"    },
      { key: "EVENTS_RETAIN",               name: "Events - Retain",                             quotedPrice: "700",   quotedUnitOfMeasure: "Per 1,000,000 gibibyte-days",               price: "0.0007"  },
      { key: "EVENTS_ANALYZE",              name: "Events - Query",                              quotedPrice: "3500",  quotedUnitOfMeasure: "Per 1,000,000 gibibytes-scanned",           price: "0.0035"  },
      { key: "TRACES_INGEST",               name: "Traces - Ingest & Process",                   quotedPrice: "2000",  quotedUnitOfMeasure: "Per 10,000 gibibytes",                      price: "0.20"    },
      { key: "TRACES_ANALYZE",              name: "Traces - Query",                              quotedPrice: "3500",  quotedUnitOfMeasure: "Per 1,000,000 gibibytes-scanned",           price: "0.0035"  },
      { key: "METRICS_INGEST",              name: "Metrics - Ingest & Process",                  quotedPrice: "2",     quotedUnitOfMeasure: "Per 1,000 metric data points",              price: "0.000002" },
      { key: "DEM_ANALYZE",                 name: "Digital Experience Monitoring - Query",       quotedPrice: "3500",  quotedUnitOfMeasure: "Per 1,000,000 gibibytes-scanned",           price: "0.0035"  },
      { key: "COMPUTE",                     name: "AppEngine Functions - Small",                 quotedPrice: "1",     quotedUnitOfMeasure: "Per 1000 invocations",                      price: "0.001"   },
    ],
  },
];

/**
 * Normalizes a capability name for tolerant matching between the rate card
 * (account or default) and the environment's billing event.type values.
 * Lower-cases and strips spaces, hyphens, ampersands and punctuation so e.g.
 * "Full-Stack Monitoring" and "Full Stack Monitoring" match.
 */
export function normalizeCapabilityName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** How a capability's billed quantity is derived from a billing usage event. */
export type BillingUnit =
  | "gib" | "gib_days" | "gib_hours" | "host_hours" | "pod_hours" | "datapoints"
  | "actions" | "requests" | "invocations" | "sessions"
  | "executions" | "container_hours" | "count";

/**
 * Maps the unit-of-measure string from the rate card to the billing-event
 * field used to compute the billed quantity.
 */
export function unitForCapability(quotedUnitOfMeasure: string): BillingUnit {
  const u = quotedUnitOfMeasure.toLowerCase();
  if (u.includes("gibibyte-hour") || u.includes("gibibyte_hour")) return "gib_hours";
  if (u.includes("gibibyte-day") || u.includes("gibibyte_day")) return "gib_days"; // retain
  if (u.includes("pod-hour") || u.includes("pod_hour")) return "pod_hours"; // k8s platform
  if (u.includes("host-hour")) return "host_hours";
  if (u.includes("data point")) return "datapoints";
  if (u.includes("synthetic action")) return "actions";
  if (u.includes("synthetic request") || u.includes("http")) return "requests";
  if (u.includes("invocation")) return "invocations";
  if (u.includes("session")) return "sessions"; // sessions / session replay captures
  if (u.includes("gibibyte")) return "gib"; // gibibytes / gibibytes-scanned
  return "count"; // no measurable billed quantity exposed in usage events
}
