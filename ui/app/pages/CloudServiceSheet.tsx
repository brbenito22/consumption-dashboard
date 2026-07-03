import React, { useMemo } from "react";
import { Sheet } from "@dynatrace/strato-components-preview/overlays";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import { Button } from "@dynatrace/strato-components/buttons";
import { Surface, Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useDql } from "../hooks/useDql";
import { useRateCard, type CapabilityRate } from "../hooks/useRateCard";
import { useCurrency } from "../context/CurrencyContext";
import { normalizeCapabilityName } from "../constants/rateCard";
import {
  cloudServiceEntitiesQuery,
  cloudHostsListQuery,
  cloudHostsBillingByCapQuery,
  CLOUD_SERVICES,
} from "../queries";
import { useLang } from "../context/LanguageContext";
import type { TimeRangeOption } from "../types";

interface CloudServiceSheetProps {
  /** Selected service key (matches a `CLOUD_SERVICES` entry). `null` closes the sheet. */
  serviceKey: string | null;
  onDismiss: () => void;
  /** Timeframe used to compute per-host billing cost for host-backed services. */
  timeRange: TimeRangeOption;
}

interface ManagedRow { id: string; name: string }
interface HostRow    { id: string; name: string }
interface BillingRow {
  id: string;
  cap: string;
  gib_hours: number;
  host_hours: number;
  pod_hours: number;
}
interface HostBackedRow {
  id: string;
  name: string;
  cost: number;
  /** Comma-joined list of capabilities that contributed cost — for tooltip / debug. */
  caps: string;
  cost_fmt: string;
}

const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return isFinite(x) ? x : 0;
};

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

export const CloudServiceSheet: React.FC<CloudServiceSheetProps> = ({ serviceKey, onDismiss, timeRange }) => {
  const { t } = useLang();
  const { money } = useCurrency();
  const rateCard = useRateCard();
  const meta = serviceKey ? CLOUD_SERVICES[serviceKey] : undefined;
  const isHostBacked = meta?.cls === "hostBacked";

  // Managed → single query. Host-backed → 2 queries (hosts + billing per cap)
  // merged client-side so hosts without any billing still appear in the list.
  const managedDql = useMemo(
    () => (serviceKey && meta?.cls === "managed" ? cloudServiceEntitiesQuery(serviceKey) : null),
    [serviceKey, meta?.cls],
  );
  const hostsListDql = useMemo(
    () => (serviceKey && isHostBacked ? cloudHostsListQuery(serviceKey) : null),
    [serviceKey, isHostBacked],
  );
  const hostsBillingDql = useMemo(
    () => (serviceKey && isHostBacked ? cloudHostsBillingByCapQuery(serviceKey, timeRange) : null),
    [serviceKey, isHostBacked, timeRange],
  );

  const managedQ = useDql<ManagedRow>(managedDql ?? "");
  const hostsListQ    = useDql<HostRow>(hostsListDql ?? "");
  const hostsBillingQ = useDql<Record<string, unknown>>(hostsBillingDql ?? "");

  const managedRows: ManagedRow[] = useMemo(
    () => ((managedQ.data ?? []) as ManagedRow[]).map((r) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? "(unnamed)"),
    })),
    [managedQ.data],
  );

  const billingByHost: Map<string, BillingRow[]> = useMemo(() => {
    const map = new Map<string, BillingRow[]>();
    for (const raw of ((hostsBillingQ.data ?? []) as Record<string, unknown>[])) {
      const row: BillingRow = {
        id: String(raw.id ?? ""),
        cap: String(raw.cap ?? ""),
        gib_hours:  n(raw.gib_hours),
        host_hours: n(raw.host_hours),
        pod_hours:  n(raw.pod_hours),
      };
      if (!row.id) continue;
      const arr = map.get(row.id) ?? [];
      arr.push(row);
      map.set(row.id, arr);
    }
    return map;
  }, [hostsBillingQ.data]);

  const hostRows: HostBackedRow[] = useMemo(() => {
    const hosts = (hostsListQ.data ?? []) as HostRow[];
    return hosts.map((h) => {
      const id = String(h.id ?? "");
      const rows = billingByHost.get(id) ?? [];
      let cost = 0;
      const capSet = new Set<string>();
      for (const row of rows) {
        const rate = rateCard.ratesByName.get(normalizeCapabilityName(row.cap));
        const rowCost = priceBillingRow(row, rate);
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
  }, [hostsListQ.data, billingByHost, rateCard.ratesByName, money]);

  const totalCost = useMemo(() => hostRows.reduce((s, r) => s + r.cost, 0), [hostRows]);

  const managedColumns = useMemo(
    () => [
      { header: "Name",      accessor: "name" },
      { header: "Entity ID", accessor: "id"   },
    ],
    [],
  );
  const hostColumns = useMemo(
    () => [
      { header: "Host name",         accessor: "name"     },
      { header: "Entity ID",         accessor: "id"       },
      { header: "Capabilities",      accessor: "caps"     },
      { header: "Cost (window)",     accessor: "cost_fmt" },
    ],
    [],
  );

  const isOpen = Boolean(serviceKey) && Boolean(meta);
  const title = meta ? `${meta.provider} · ${meta.label}` : "";
  const noteKey = isHostBacked ? "cloud.sheet.noteHostBacked" : "cloud.sheet.noteManaged";
  const activeIsLoading = isHostBacked
    ? (hostsListQ.isLoading || hostsBillingQ.isLoading)
    : managedQ.isLoading;
  const activeError = isHostBacked
    ? (hostsListQ.error || hostsBillingQ.error)
    : managedQ.error;
  const totalRows = isHostBacked ? hostRows.length : managedRows.length;
  const rateCoverageEmpty = isHostBacked && !activeIsLoading && hostRows.length > 0 && totalCost === 0;

  return (
    <Sheet
      show={isOpen}
      onDismiss={onDismiss}
      title={title}
      actions={<Button variant="default" onClick={onDismiss}>{t("cloud.sheet.close")}</Button>}
    >
      {isOpen && meta && (
        <Flex flexDirection="column" gap={16} padding={16}>
          {/* Class disclaimer — mandatory context. */}
          <Surface elevation="flat" color="primary" style={{ padding: "12px 14px" }}>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
              {t(noteKey)}
            </Text>
          </Surface>

          {/* Summary row — count + total cost when host-backed. */}
          <Flex justifyContent="space-between" alignItems="baseline" gap={8} flexWrap="wrap">
            <Heading level={5} style={{ margin: 0 }}>{t("cloud.sheet.entities")}</Heading>
            <Flex gap={16} alignItems="baseline">
              <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Subdued }}>
                {activeIsLoading ? "…" : `${totalRows} ${totalRows === 1 ? t("cloud.sheet.entityOne") : t("cloud.sheet.entityMany")}`}
              </Text>
              {isHostBacked && !activeIsLoading && (
                <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Default }}>
                  {t("cloud.sheet.totalCost")}: <span style={{ color: totalCost > 0 ? Colors.Text.Warning.Default : Colors.Text.Neutral.Default }}>{money(totalCost)}</span>
                </Text>
              )}
            </Flex>
          </Flex>

          {rateCoverageEmpty && (
            <Surface elevation="flat" color="primary" style={{ padding: "10px 14px" }}>
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
                {t("cloud.sheet.zeroBilling")}
              </Text>
            </Surface>
          )}

          {activeError ? (
            <Text textStyle="small" style={{ color: Colors.Text.Critical.Default }}>
              {t("cloud.sheet.errorLoading")}
            </Text>
          ) : totalRows === 0 && !activeIsLoading ? (
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
              {t("cloud.sheet.empty")}
            </Text>
          ) : isHostBacked ? (
            <DataTable data={hostRows}    columns={hostColumns}    sortable resizable />
          ) : (
            <DataTable data={managedRows} columns={managedColumns} sortable resizable />
          )}
        </Flex>
      )}
    </Sheet>
  );
};
