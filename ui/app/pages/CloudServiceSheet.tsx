import React, { useMemo } from "react";
import { Sheet } from "@dynatrace/strato-components-preview/overlays";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import { Button } from "@dynatrace/strato-components/buttons";
import { Surface, Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useCloudServiceDetail } from "../hooks/useCloudServiceDetail";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import type { TimeRangeOption } from "../types";

interface CloudServiceSheetProps {
  /** Selected service key (matches a `CLOUD_SERVICES` entry). `null` closes the sheet. */
  serviceKey: string | null;
  onDismiss: () => void;
  /** Timeframe used to compute per-host billing cost for host-backed services. */
  timeRange: TimeRangeOption;
}

const MANAGED_COLUMNS = [
  { header: "Name",      accessor: "name" },
  { header: "Entity ID", accessor: "id"   },
];
const HOST_COLUMNS = [
  { header: "Host name",     accessor: "name"     },
  { header: "Entity ID",     accessor: "id"       },
  { header: "Capabilities",  accessor: "caps"     },
  { header: "Cost (window)", accessor: "cost_fmt" },
];

/**
 * Cloud-service drill-down sheet. Purely presentational — every query and all
 * pricing live in useCloudServiceDetail, so this component only decides which
 * of the four states to render: error, empty, host-backed table, managed table.
 */
export const CloudServiceSheet: React.FC<CloudServiceSheetProps> = ({ serviceKey, onDismiss, timeRange }) => {
  const { t } = useLang();
  const { money } = useCurrency();
  const d = useCloudServiceDetail(serviceKey, timeRange);

  const isOpen = Boolean(serviceKey) && Boolean(d.meta);
  const title = d.meta ? `${d.meta.provider} · ${d.meta.label}` : "";

  const entityCount = useMemo(() => {
    if (d.isLoading) return "…";
    const unit = d.totalRows === 1 ? t("cloud.sheet.entityOne") : t("cloud.sheet.entityMany");
    return `${d.totalRows} ${unit}`;
  }, [d.isLoading, d.totalRows, t]);

  const body = () => {
    if (d.error) {
      return <Text textStyle="small" style={{ color: Colors.Text.Critical.Default }}>{t("cloud.sheet.errorLoading")}</Text>;
    }
    if (d.totalRows === 0 && !d.isLoading) {
      return <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>{t("cloud.sheet.empty")}</Text>;
    }
    return d.isHostBacked
      ? <DataTable data={d.hostRows}    columns={HOST_COLUMNS}    sortable resizable />
      : <DataTable data={d.managedRows} columns={MANAGED_COLUMNS} sortable resizable />;
  };

  return (
    <Sheet
      show={isOpen}
      onDismiss={onDismiss}
      title={title}
      actions={<Button variant="default" onClick={onDismiss}>{t("cloud.sheet.close")}</Button>}
    >
      {isOpen && d.meta && (
        <Flex flexDirection="column" gap={16} padding={16}>
          {/* Class disclaimer — mandatory context. */}
          <Surface elevation="flat" color="primary" style={{ padding: "12px 14px" }}>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
              {t(d.isHostBacked ? "cloud.sheet.noteHostBacked" : "cloud.sheet.noteManaged")}
            </Text>
          </Surface>

          {/* Summary row — count + total cost when host-backed. */}
          <Flex justifyContent="space-between" alignItems="baseline" gap={8} flexWrap="wrap">
            <Heading level={5} style={{ margin: 0 }}>{t("cloud.sheet.entities")}</Heading>
            <Flex gap={16} alignItems="baseline">
              <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Subdued }}>
                {entityCount}
              </Text>
              {d.isHostBacked && !d.isLoading && (
                <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Default }}>
                  {t("cloud.sheet.totalCost")}:{" "}
                  <span style={{ color: d.totalCost > 0 ? Colors.Text.Warning.Default : Colors.Text.Neutral.Default }}>
                    {money(d.totalCost)}
                  </span>
                </Text>
              )}
            </Flex>
          </Flex>

          {d.rateCoverageEmpty && (
            <Surface elevation="flat" color="primary" style={{ padding: "10px 14px" }}>
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
                {t("cloud.sheet.zeroBilling")}
              </Text>
            </Surface>
          )}

          {body()}
        </Flex>
      )}
    </Sheet>
  );
};
