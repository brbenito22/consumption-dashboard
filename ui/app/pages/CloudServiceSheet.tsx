import React, { useMemo } from "react";
import { Sheet } from "@dynatrace/strato-components-preview/overlays";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import { Button } from "@dynatrace/strato-components/buttons";
import { Surface, Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useDql } from "../hooks/useDql";
import { useRateCard } from "../hooks/useRateCard";
import { useCurrency } from "../context/CurrencyContext";
import { normalizeCapabilityName } from "../constants/rateCard";
import {
  cloudServiceEntitiesQuery,
  cloudHostCostByEntityQuery,
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
interface HostBackedRow {
  id: string;
  name: string;
  gib_hours: number;
  host_hours: number;
  cost: number;
  /** Pre-formatted strings for DataTable display (formatter API is deprecated). */
  gib_hours_fmt: string;
  host_hours_fmt: string;
  cost_fmt: string;
}

const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return isFinite(x) ? x : 0;
};

export const CloudServiceSheet: React.FC<CloudServiceSheetProps> = ({ serviceKey, onDismiss, timeRange }) => {
  const { t } = useLang();
  const { money } = useCurrency();
  const rateCard = useRateCard();
  const meta = serviceKey ? CLOUD_SERVICES[serviceKey] : undefined;
  const isHostBacked = meta?.cls === "hostBacked";

  // Two queries mutually exclusive per service class. The unused one runs with
  // an empty string, which `useDql` early-returns from — no orphan Grail scan.
  const managedDql = useMemo(
    () => (serviceKey && meta?.cls === "managed" ? cloudServiceEntitiesQuery(serviceKey) : null),
    [serviceKey, meta?.cls],
  );
  const hostDql = useMemo(
    () => (serviceKey && isHostBacked ? cloudHostCostByEntityQuery(serviceKey, timeRange) : null),
    [serviceKey, isHostBacked, timeRange],
  );

  const managedQ = useDql<ManagedRow>(managedDql ?? "");
  const hostQ    = useDql<Record<string, unknown>>(hostDql ?? "");

  // Rate card lookups — same names Cost Engine uses for these capabilities.
  const fsRate    = rateCard.ratesByName.get(normalizeCapabilityName("Full-Stack Monitoring"));
  const infraRate = rateCard.ratesByName.get(normalizeCapabilityName("Infrastructure Monitoring"));

  const managedRows: ManagedRow[] = useMemo(
    () => ((managedQ.data ?? []) as ManagedRow[]).map((r) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? "(unnamed)"),
    })),
    [managedQ.data],
  );

  const hostRows: HostBackedRow[] = useMemo(() => {
    const raw = (hostQ.data ?? []) as Record<string, unknown>[];
    return raw.map((r) => {
      const gib_hours  = n(r.gib_hours);
      const host_hours = n(r.host_hours);
      const cost = gib_hours * (fsRate?.price ?? 0) + host_hours * (infraRate?.price ?? 0);
      return {
        id: String(r.id ?? ""),
        name: String(r.name ?? "(unnamed)"),
        gib_hours,
        host_hours,
        cost,
        gib_hours_fmt:  gib_hours.toFixed(2),
        host_hours_fmt: host_hours.toFixed(2),
        cost_fmt:       money(cost),
      };
    });
  }, [hostQ.data, fsRate?.price, infraRate?.price, money]);

  const totalCost = useMemo(
    () => hostRows.reduce((s, r) => s + r.cost, 0),
    [hostRows],
  );

  // DataTable columns — different shape per class.
  const managedColumns = useMemo(
    () => [
      { header: "Name",      accessor: "name" },
      { header: "Entity ID", accessor: "id"   },
    ],
    [],
  );

  const hostColumns = useMemo(
    () => [
      { header: "Host name",              accessor: "name"           },
      { header: "Entity ID",              accessor: "id"             },
      { header: "GiB-hours (Full-Stack)", accessor: "gib_hours_fmt"  },
      { header: "Host-hours (Infra)",     accessor: "host_hours_fmt" },
      { header: "Cost (window)",          accessor: "cost_fmt"       },
    ],
    [],
  );

  const isOpen = Boolean(serviceKey) && Boolean(meta);
  const title = meta ? `${meta.provider} · ${meta.label}` : "";
  const noteKey = isHostBacked ? "cloud.sheet.noteHostBacked" : "cloud.sheet.noteManaged";
  const activeQ = isHostBacked ? hostQ : managedQ;
  const totalRows = isHostBacked ? hostRows.length : managedRows.length;
  const rateMissing = isHostBacked && (!fsRate || !infraRate);

  return (
    <Sheet
      show={isOpen}
      onDismiss={onDismiss}
      title={title}
      actions={<Button variant="default" onClick={onDismiss}>{t("cloud.sheet.close")}</Button>}
    >
      {isOpen && meta && (
        <Flex flexDirection="column" gap={16} padding={16}>
          {/* Class disclaimer — mandatory context: A → cost also on Infra tab (not double-billed);
              B → no per-service SKU, aggregate lives in the Cloud metrics section. */}
          <Surface elevation="flat" color="primary" style={{ padding: "12px 14px" }}>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
              {t(noteKey)}
            </Text>
          </Surface>

          {/* Summary row — count on both classes, total cost on host-backed only. */}
          <Flex justifyContent="space-between" alignItems="baseline" gap={8} flexWrap="wrap">
            <Heading level={5} style={{ margin: 0 }}>{t("cloud.sheet.entities")}</Heading>
            <Flex gap={16} alignItems="baseline">
              <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Subdued }}>
                {activeQ.isLoading ? "…" : `${totalRows} ${totalRows === 1 ? t("cloud.sheet.entityOne") : t("cloud.sheet.entityMany")}`}
              </Text>
              {isHostBacked && !activeQ.isLoading && (
                <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Default }}>
                  {t("cloud.sheet.totalCost")}: <span style={{ color: totalCost > 0 ? Colors.Text.Warning.Default : Colors.Text.Neutral.Default }}>{money(totalCost)}</span>
                </Text>
              )}
            </Flex>
          </Flex>

          {rateMissing && (
            <Surface elevation="flat" color="warning" style={{ padding: "10px 14px" }}>
              <Text textStyle="small" style={{ color: Colors.Text.Warning.Default }}>
                {t("cloud.sheet.rateMissing")}
              </Text>
            </Surface>
          )}

          {activeQ.error ? (
            <Text textStyle="small" style={{ color: Colors.Text.Critical.Default }}>
              {t("cloud.sheet.errorLoading")}
            </Text>
          ) : totalRows === 0 && !activeQ.isLoading ? (
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
