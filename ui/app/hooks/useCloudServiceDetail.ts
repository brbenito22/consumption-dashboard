import { useMemo } from "react";
import { useDql } from "./useDql";
import { useRateCard, type CapabilityRate } from "./useRateCard";
import { useCostCalibration } from "./useCostCalibration";
import { useCurrency } from "../context/CurrencyContext";
import { normalizeCapabilityName } from "../constants/rateCard";
import { num } from "../utils/format";
import {
  cloudServiceEntitiesQuery,
  cloudHostsListQuery,
  cloudHostsBillingByCapQuery,
  CLOUD_SERVICES,
} from "../queries";
import type { TimeRangeOption } from "../types";

export interface ManagedRow { id: string; name: string }
export interface HostBackedRow {
  id: string;
  name: string;
  cost: number;
  /** Comma-joined list of capabilities that contributed cost — for tooltip / debug. */
  caps: string;
  cost_fmt: string;
}

interface HostRow { id: string; name: string }
interface BillingRow {
  id: string;
  cap: string;
  gib_hours: number;
  host_hours: number;
  pod_hours: number;
}

export interface CloudServiceDetail {
  meta: (typeof CLOUD_SERVICES)[string] | undefined;
  isHostBacked: boolean;
  managedRows: ManagedRow[];
  hostRows: HostBackedRow[];
  totalCost: number;
  /** Row count for the active class (managed or host-backed). */
  totalRows: number;
  isLoading: boolean;
  error: string | null;
  /** Hosts exist but priced to zero — a rate-card coverage gap worth flagging. */
  rateCoverageEmpty: boolean;
}

/**
 * Cost of a single billing row given the rate for its capability.
 * The rate's `unit` decides which quantity field on the row is priced —
 * this is how the same query row can price capabilities as different as
 * Full-Stack (gib-hours) and Kubernetes Platform (pod-hours) correctly.
 */
function priceBillingRow(row: BillingRow, rate: CapabilityRate | undefined): number {
  if (!rate) return 0;
  switch (rate.unit) {
    case "gib_hours":  return row.gib_hours  * rate.price;
    case "host_hours": return row.host_hours * rate.price;
    case "pod_hours":  return row.pod_hours  * rate.price;
    // Cloud host billing does not surface volumes/counts as gib / gib_days /
    // datapoints / sessions / actions / invocations / requests on the host
    // dimension — those are per-tenant capabilities, not per-host.
    default:           return 0;
  }
}

/**
 * Data behind the cloud-service drill-down sheet.
 *
 * Managed services resolve to a single entity query. Host-backed services need
 * two (host list + billing per capability) merged client-side, so a host with
 * no billing in the window still shows up instead of silently vanishing.
 * Passing `serviceKey: null` parks every query — the sheet is closed.
 */
export function useCloudServiceDetail(
  serviceKey: string | null,
  timeRange: TimeRangeOption,
): CloudServiceDetail {
  const rateCard = useRateCard();
  const calibration = useCostCalibration();
  const { money } = useCurrency();

  const meta = serviceKey ? CLOUD_SERVICES[serviceKey] : undefined;
  const isHostBacked = meta?.cls === "hostBacked";
  const isManaged = meta?.cls === "managed";

  // An empty query string parks useDql — that is how a closed sheet (null key)
  // and a class mismatch both end up running nothing.
  const key = serviceKey ?? "";

  // The builders return null for an unknown service key, so every branch is
  // coalesced to "" — the same parked-query signal as a closed sheet.
  const managedQ = useDql<ManagedRow>(
    useMemo(() => (key && isManaged ? cloudServiceEntitiesQuery(key) ?? "" : ""), [key, isManaged]),
  );
  const hostsListQ = useDql<HostRow>(
    useMemo(() => (key && isHostBacked ? cloudHostsListQuery(key) ?? "" : ""), [key, isHostBacked]),
  );
  const hostsBillingQ = useDql<Record<string, unknown>>(
    useMemo(
      () => (key && isHostBacked ? cloudHostsBillingByCapQuery(key, timeRange) ?? "" : ""),
      [key, isHostBacked, timeRange],
    ),
  );

  const managedRows: ManagedRow[] = useMemo(
    () => ((managedQ.data ?? []) as ManagedRow[]).map((r) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? "(unnamed)"),
    })),
    [managedQ.data],
  );

  const billingByHost = useMemo(() => {
    const map = new Map<string, BillingRow[]>();
    for (const raw of ((hostsBillingQ.data ?? []) as Record<string, unknown>[])) {
      const id = String(raw.id ?? "");
      if (!id) continue;
      const arr = map.get(id) ?? [];
      arr.push({
        id,
        cap: String(raw.cap ?? ""),
        gib_hours:  num(raw.gib_hours),
        host_hours: num(raw.host_hours),
        pod_hours:  num(raw.pod_hours),
      });
      map.set(id, arr);
    }
    return map;
  }, [hostsBillingQ.data]);

  const hostRows: HostBackedRow[] = useMemo(() => {
    const hosts = (hostsListQ.data ?? []) as HostRow[];
    return hosts.map((h) => {
      const id = String(h.id ?? "");
      let cost = 0;
      const capSet = new Set<string>();
      for (const row of (billingByHost.get(id) ?? [])) {
        const rate = rateCard.ratesByName.get(normalizeCapabilityName(row.cap));
        // Calibrated to the official Subscription-API basis per capability.
        const rowCost = priceBillingRow(row, rate) * calibration.factorFor(row.cap);
        if (rowCost > 0) capSet.add(row.cap);
        cost += rowCost;
      }
      return {
        id,
        name: String(h.name ?? "(unnamed)"),
        cost,
        caps: [...capSet].sort().join(", ") || "—",
        cost_fmt: money(cost),
      };
    });
  }, [hostsListQ.data, billingByHost, rateCard.ratesByName, money, calibration]);

  const totalCost = useMemo(() => hostRows.reduce((s, r) => s + r.cost, 0), [hostRows]);

  const isLoading = isHostBacked ? (hostsListQ.isLoading || hostsBillingQ.isLoading) : managedQ.isLoading;
  const error = isHostBacked ? (hostsListQ.error ?? hostsBillingQ.error) : managedQ.error;
  const totalRows = isHostBacked ? hostRows.length : managedRows.length;

  return {
    meta,
    isHostBacked,
    managedRows,
    hostRows,
    totalCost,
    totalRows,
    isLoading,
    error,
    rateCoverageEmpty: isHostBacked && !isLoading && hostRows.length > 0 && totalCost === 0,
  };
}
