import React, { useMemo } from "react";
import { Sheet } from "@dynatrace/strato-components-preview/overlays";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import { Button } from "@dynatrace/strato-components/buttons";
import { Surface, Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useDql } from "../hooks/useDql";
import { cloudServiceEntitiesQuery, CLOUD_SERVICES } from "../queries";
import { useLang } from "../context/LanguageContext";

interface CloudServiceSheetProps {
  /** Selected service key (matches a `CLOUD_SERVICES` entry). `null` closes the sheet. */
  serviceKey: string | null;
  onDismiss: () => void;
}

interface EntityRow { id: string; name: string }

export const CloudServiceSheet: React.FC<CloudServiceSheetProps> = ({ serviceKey, onDismiss }) => {
  const { t } = useLang();
  const meta = serviceKey ? CLOUD_SERVICES[serviceKey] : undefined;
  const dql = useMemo(
    () => (serviceKey ? cloudServiceEntitiesQuery(serviceKey) : null),
    [serviceKey],
  );
  // useDql expects a non-empty string; skip fetch until we have a query.
  const q = useDql<EntityRow>(dql ?? "");

  const rows: EntityRow[] = useMemo(
    () => ((q.data ?? []) as EntityRow[]).map((r) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? "(unnamed)"),
    })),
    [q.data],
  );

  const columns = useMemo(
    () => [
      { header: "Name",     accessor: "name" },
      { header: "Entity ID", accessor: "id"  },
    ],
    [],
  );

  const isOpen = Boolean(serviceKey) && Boolean(meta);
  const title = meta ? `${meta.provider} · ${meta.label}` : "";

  const noteKey = meta?.cls === "hostBacked"
    ? "cloud.sheet.noteHostBacked"
    : "cloud.sheet.noteManaged";

  return (
    <Sheet
      show={isOpen}
      onDismiss={onDismiss}
      title={title}
      actions={<Button variant="default" onClick={onDismiss}>{t("cloud.sheet.close")}</Button>}
    >
      {isOpen && meta && (
        <Flex flexDirection="column" gap={16} padding={16}>
          {/* Class disclaimer note (Class A: cost is in Infra tab · Class B: aggregate DPS) */}
          <Surface elevation="flat" color="primary" style={{ padding: "12px 14px" }}>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
              {t(noteKey)}
            </Text>
          </Surface>

          {/* Count summary */}
          <Flex justifyContent="space-between" alignItems="baseline" gap={8}>
            <Heading level={5} style={{ margin: 0 }}>{t("cloud.sheet.entities")}</Heading>
            <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Subdued }}>
              {q.isLoading ? "…" : rows.length}
            </Text>
          </Flex>

          {q.error ? (
            <Text textStyle="small" style={{ color: Colors.Text.Critical.Default }}>
              {t("cloud.sheet.errorLoading")}
            </Text>
          ) : rows.length === 0 && !q.isLoading ? (
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
              {t("cloud.sheet.empty")}
            </Text>
          ) : (
            <DataTable data={rows} columns={columns} sortable resizable />
          )}
        </Flex>
      )}
    </Sheet>
  );
};
