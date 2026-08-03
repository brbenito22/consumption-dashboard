import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { fmtNum, fmtGib, fmtInt } from "../utils/format";
import { dashboardUrl } from "../utils/settingsLink";
import type { QuerySpender, DashboardSpender } from "../hooks/useQueryCost";

export type SpenderAxis = "user" | "app" | "dashboard";

interface QuerySpenderTableProps {
  axis: SpenderAxis;
  onAxisChange: (axis: SpenderAxis) => void;
  spenders: (QuerySpender | DashboardSpender)[];
  /** Denominator for the share column — the exact total, not the table sum. */
  totalCost: number;
  isLoading: boolean;
}

/** Dashboard ids render as deep links — the point of that axis is jumping to the tile. */
const dashboardCell = ({ value }: { value: unknown }) => (
  <a
    href={dashboardUrl(String(value))}
    target="_blank"
    rel="noreferrer"
    style={{ color: Colors.Text.Primary.Default, fontFamily: "monospace", fontSize: 12 }}
  >
    {String(value)}
  </a>
);

/**
 * "Who / where the spend comes from": one table, three axes (dashboard, user,
 * app). Dashboard is the default because that is usually the actual offender —
 * a tile re-running on auto-refresh, not the person who opened it.
 */
export const QuerySpenderTable: React.FC<QuerySpenderTableProps> = ({
  axis, onAxisChange, spenders, totalCost, isLoading,
}) => {
  const { money } = useCurrency();
  const { t } = useLang();

  const rows = useMemo(
    () => spenders.map((s) => ({
      key: s.key,
      cost_fmt: money(s.cost),
      share_fmt: totalCost > 0 ? `${fmtNum((s.cost / totalCost) * 100)}%` : "—",
      gib_fmt: fmtGib(s.gib),
      queries_fmt: fmtInt(s.queries),
      avg_fmt: fmtGib(s.avgGib),
      max_fmt: fmtGib(s.maxGib),
      viewers_fmt: "viewers" in s ? fmtInt((s as DashboardSpender).viewers) : "—",
    })),
    [spenders, totalCost, money],
  );

  const columns = useMemo(() => {
    const header = axis === "user" ? t("query.user") : axis === "app" ? t("query.app") : t("query.dashboard");
    const keyCol = axis === "dashboard"
      ? { header, accessor: "key", cell: dashboardCell }
      : { header, accessor: "key" };
    return [
      keyCol,
      { header: t("query.cost"), accessor: "cost_fmt" },
      { header: t("query.share"), accessor: "share_fmt" },
      { header: t("query.scanned"), accessor: "gib_fmt" },
      { header: t("query.count"), accessor: "queries_fmt" },
      { header: t("query.avg"), accessor: "avg_fmt" },
      { header: t("query.biggest"), accessor: "max_fmt" },
      ...(axis === "dashboard" ? [{ header: t("query.viewers"), accessor: "viewers_fmt" }] : []),
    ];
  }, [axis, t]);

  const title = axis === "user" ? t("query.byUser") : axis === "app" ? t("query.byApp") : t("query.byDashboard");
  const axes: { key: SpenderAxis; label: string }[] = [
    { key: "dashboard", label: t("query.byDashboard") },
    { key: "user",      label: t("query.byUser") },
    { key: "app",       label: t("query.byApp") },
  ];

  return (
    <Flex flexDirection="column" gap={12}>
      <Flex justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={8}>
        <Heading level={3} style={{ margin: 0 }}>{title}</Heading>
        <Flex gap={8}>
          {axes.map((a) => (
            <Button
              key={a.key}
              variant={axis === a.key ? "emphasized" : "default"}
              onClick={() => onAxisChange(a.key)}
            >
              {a.label}
            </Button>
          ))}
        </Flex>
      </Flex>
      {axis === "dashboard" && (
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, maxWidth: 760 }}>
          {t("query.dash.note")}
        </Text>
      )}
      {isLoading ? (
        <Text>Loading…</Text>
      ) : rows.length === 0 && axis === "dashboard" ? (
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>{t("query.dash.none")}</Text>
      ) : (
        <DataTable data={rows} columns={columns} sortable resizable />
      )}
    </Flex>
  );
};
