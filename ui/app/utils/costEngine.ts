import type { CapabilityRate } from "../hooks/useRateCard";
import { normalizeCapabilityName } from "../constants/rateCard";

/** A billing-detail row as returned by billingDetailByTypeQuery. */
export interface BillingDetailRow {
  event_type?: unknown;
  data_gib?: unknown;
  /** Average retained volume per snapshot — used to derive GiB-days for retain. */
  avg_gib?: unknown;
  gib_hours?: unknown;
  pod_hours?: unknown;
  host_hours?: unknown;
  host_unit_hours?: unknown;
  data_points?: unknown;
  synthetic_actions?: unknown;
  http_requests?: unknown;
  invocations?: unknown;
  sessions?: unknown;
  event_count?: unknown;
}

export interface CapabilityCost {
  capability: string;
  /** Billed quantity in the capability's unit of measure. */
  quantity: number;
  unitLabel: string;
  pricePerUnit: number;
  cost: number;
  /** True when no rate card entry matched this capability. */
  unmatched: boolean;
}

export interface CostBreakdown {
  rows: CapabilityCost[];
  totalCost: number;
  totalGib: number;
  matchedCount: number;
  unmatchedCount: number;
}

const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return isFinite(x) ? x : 0;
};

const unitLabel = (unit: CapabilityRate["unit"]): string => {
  switch (unit) {
    case "gib":         return "GiB";
    case "gib_days":    return "GiB-days";
    case "gib_hours":   return "GiB-hours";
    case "pod_hours":   return "pod-hours";
    case "host_hours":  return "host-hours";
    case "datapoints":  return "data points";
    case "actions":     return "synthetic actions";
    case "requests":    return "requests";
    case "invocations": return "invocations";
    case "sessions":    return "sessions";
    default:            return "units";
  }
};

function quantityForRow(row: BillingDetailRow, rate: CapabilityRate, windowHours: number): number {
  switch (rate.unit) {
    case "gib":         return n(row.data_gib);
    // Retain bills GiB-days: each event is a snapshot of the retained volume,
    // so GiB-days = average retained volume × number of days in the window.
    case "gib_days":    return n(row.avg_gib) * (windowHours / 24);
    case "gib_hours":   return n(row.gib_hours);
    case "pod_hours":   return n(row.pod_hours);
    case "host_hours":  return n(row.host_hours);
    case "datapoints":  return n(row.data_points);
    case "actions":     return n(row.synthetic_actions);
    case "requests":    return n(row.http_requests);
    case "invocations": return n(row.invocations);
    case "sessions":    return n(row.sessions);
    // "count" capabilities expose no metered quantity in usage events → not priced
    default:            return 0;
  }
}

/**
 * Cross-references actual consumption (billing usage events) with the
 * environment rate card to produce an end-to-end cost breakdown.
 */
export function computeCost(
  rows: BillingDetailRow[],
  ratesByName: Map<string, CapabilityRate>,
  windowHours = 168,
): CostBreakdown {
  const out: CapabilityCost[] = [];
  let totalCost = 0;
  let totalGib = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;

  for (const row of rows) {
    const capability = String(row.event_type ?? "Unknown");
    const rate = ratesByName.get(normalizeCapabilityName(capability));
    totalGib += n(row.data_gib);

    if (!rate) {
      unmatchedCount++;
      out.push({
        capability,
        quantity: n(row.data_gib) || n(row.gib_hours) || n(row.event_count),
        unitLabel: "—",
        pricePerUnit: 0,
        cost: 0,
        unmatched: true,
      });
      continue;
    }

    matchedCount++;
    const quantity = quantityForRow(row, rate, windowHours);
    const cost = quantity * rate.price;
    totalCost += cost;
    out.push({
      capability,
      quantity,
      unitLabel: unitLabel(rate.unit),
      pricePerUnit: rate.price,
      cost,
      unmatched: false,
    });
  }

  out.sort((a, b) => b.cost - a.cost || b.quantity - a.quantity);
  return { rows: out, totalCost, totalGib, matchedCount, unmatchedCount };
}
