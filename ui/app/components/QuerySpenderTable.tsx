import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { useDashboardNames } from "../hooks/useDashboardNames";
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

/** Middle-truncate a UUID so both ends stay recognizable: "f3e5279e…eac1853". */
const shortId = (id: string) => (id.length <= 20 ? id : `${id.slice(0, 8)}…${id.slice(-7)}`);

/**
 * Dashboard cell: the name when we could resolve it (id as tooltip), the
 * shortened id otherwise. Always a deep link — the point of this axis is
 * jumping to the tile that needs fixing.
 */
const makeDashboardCell = (names: Map<string, string>) =>
  function DashboardCell({ value }: { value: unknown }) {
    const id = String(value);
    const name = names.get(id);
    return (
      <a
        href={dashboardUrl(id)}
        target="_blank"
        rel="noreferrer"
        title={name ? `${name} · ${id}` : id}
        style={{
          color: Colors.Text.Primary.Default,
          fontFamily: name ? undefined : "monospace",
          fontSize: name ? undefined : 12,
        }}
      >
        {name ?? shortId(id)}
      </a>
    );
  };

/**
 * Cost cell with a proportional bar behind the value — the eye finds the
 * dominant spender without reading a single number.
 */
const makeCostCell = (maxCost: number) =>
  function CostCell({ value, row }: { value: unknown; row?: { original?: { cost_raw?: number } } }) {
    const raw = row?.original?.cost_raw ?? 0;
    const pct = maxCost > 0 ? Math.min((raw / maxCost) * 100, 100) : 0;
    return (
      <div style={{ position: "relative", width: "100%" }}>
        {/* Border.Primary.Accent, not Background.Field.* — the field tints are
            near-invisible against the dark row background. */}
        <div style={{
          position: "absolute", left: 0, top: 2, bottom: 2, width: `${pct}%`,
          background: Colors.Border.Primary.Accent, borderRadius: 3, opacity: 0.32,
        }} />
        <span style={{ position: "relative", fontWeight: 600 }}>{String(value)}</span>
      </div>
    );
  };

/**
 * Color for a GiB figure — same thresholds the KPI cards use, so a 200 GiB
 * average reads as a problem in the table too, not just up top.
 */
const gibColor = (gib: number) =>
  gib >= 100 ? Colors.Text.Critical.Default
  : gib >= 10 ? Colors.Text.Warning.Default
  : Colors.Text.Neutral.Default;

const makeGibCell = (rawKey: string) =>
  function GibCell({ value, row }: { value: unknown; row?: { original?: Record<string, unknown> } }) {
    const raw = Number(row?.original?.[rawKey] ?? 0);
    return <span style={{ color: gibColor(raw), fontWeight: raw >= 10 ? 600 : 400 }}>{String(value)}</span>;
  };

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
  // Names resolve independently of the cost data — the table renders ids first
  // and upgrades to names when they arrive, never blocking on them.
  const { byId: names } = useDashboardNames();

  const rows = useMemo(
    () => spenders.map((s) => ({
      key: s.key,
      cost_fmt: money(s.cost),
      // Raw values ride along so the cell renderers can size bars and pick
      // severity colors without re-parsing the formatted strings.
      cost_raw: s.cost,
      avg_raw: s.avgGib,
      max_raw: s.maxGib,
      share_fmt: totalCost > 0 ? `${fmtNum((s.cost / totalCost) * 100)}%` : "—",
      gib_fmt: fmtGib(s.gib),
      queries_fmt: fmtInt(s.queries),
      avg_fmt: fmtGib(s.avgGib),
      max_fmt: fmtGib(s.maxGib),
      viewers_fmt: "viewers" in s ? fmtInt((s as DashboardSpender).viewers) : "—",
    })),
    [spenders, totalCost, money],
  );

  const maxCost = useMemo(() => spenders.reduce((m, s) => Math.max(m, s.cost), 0), [spenders]);

  const columns = useMemo(() => {
    const header = axis === "user" ? t("query.user") : axis === "app" ? t("query.app") : t("query.dashboard");
    const keyCol = axis === "dashboard"
      // Dashboard names run long ("Kubernetes Cluster Overview — prod"), so this
      // column gets the room; truncating it defeats the point of resolving them.
      ? { header, accessor: "key", cell: makeDashboardCell(names), minWidth: 320 }
      : { header, accessor: "key", minWidth: 240 };
    return [
      keyCol,
      { header: t("query.cost"), accessor: "cost_fmt", cell: makeCostCell(maxCost), minWidth: 130 },
      { header: t("query.share"), accessor: "share_fmt", minWidth: 90 },
      { header: t("query.scanned"), accessor: "gib_fmt", minWidth: 110 },
      { header: t("query.count"), accessor: "queries_fmt", minWidth: 90 },
      { header: t("query.avg"), accessor: "avg_fmt", cell: makeGibCell("avg_raw"), minWidth: 120 },
      { header: t("query.biggest"), accessor: "max_fmt", cell: makeGibCell("max_raw"), minWidth: 120 },
      ...(axis === "dashboard" ? [{ header: t("query.viewers"), accessor: "viewers_fmt", minWidth: 90 }] : []),
    ];
  }, [axis, t, names, maxCost]);

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
