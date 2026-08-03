import React, { useMemo } from "react";
import { Surface, Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { fmtNum, fmtGib, fmtInt } from "../utils/format";
import type { RepeatedQuery } from "../hooks/useQueryCost";

/** "16/07 21:31 → 17/07 19:43" — compact enough for a table cell. */
function fmtWindow(from: string, to: string): string {
  const d = (s: string) => {
    const t = new Date(s).getTime();
    if (!isFinite(t)) return "—";
    return new Date(t).toISOString().slice(5, 16).replace("T", " ").replace("-", "/");
  };
  return `${d(from)} → ${d(to)}`;
}

interface RepeatedQueryPanelProps {
  repeated: RepeatedQuery[];
  /** Waste across ALL repeat groups — not just the rows in the table. */
  wastedCost: number;
  wastedGib: number;
  /** Waste as a share of total query cost. */
  wastePct: number;
}

/**
 * Recoverable-waste panel: queries that repeat with a byte-identical scan.
 * A person writing DQL never reproduces a byte count to the digit — that
 * pattern is an auto-refreshing dashboard tile or an automation loop. Only
 * repeats beyond the first are counted, since that spend bought no new data.
 *
 * The table shows the worst offenders; the headline covers every group.
 */
export const RepeatedQueryPanel: React.FC<RepeatedQueryPanelProps> = ({
  repeated, wastedCost, wastedGib, wastePct,
}) => {
  const { money } = useCurrency();
  const { t } = useLang();

  const rows = useMemo(
    () => repeated.map((r) => ({
      actor: r.actor,
      app: r.app,
      each_fmt: fmtGib(r.gibEach),
      repeats_fmt: fmtInt(r.repeats),
      wasted_gib_fmt: fmtGib(r.wastedGib),
      wasted_cost_fmt: money(r.wastedCost),
      window_fmt: fmtWindow(r.firstSeen, r.lastSeen),
    })),
    [repeated, money],
  );

  const columns = useMemo(
    () => [
      // Widths sized so emails and app ids stay readable — truncating these to
      // "diego.corr…" / "dynatrace…." hides exactly what the panel is for.
      { header: t("query.user"), accessor: "actor", minWidth: 210 },
      { header: t("query.app"), accessor: "app", minWidth: 170 },
      { header: t("query.waste.each"), accessor: "each_fmt", minWidth: 110 },
      { header: t("query.waste.repeats"), accessor: "repeats_fmt", minWidth: 95 },
      { header: t("query.waste.wasted"), accessor: "wasted_gib_fmt", minWidth: 110 },
      { header: t("query.cost"), accessor: "wasted_cost_fmt", minWidth: 120 },
      { header: t("query.waste.window"), accessor: "window_fmt", minWidth: 210 },
    ],
    [t],
  );

  return (
    <Surface
      elevation="flat"
      color="warning"
      style={{
        padding: "18px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: Colors.Background.Field.Warning.Default,
        border: `1px solid ${Colors.Border.Warning.Default}`,
      }}
    >
      <Flex justifyContent="space-between" alignItems="baseline" flexWrap="wrap" gap={12}>
        <Heading level={4} style={{ margin: 0 }}>{t("query.waste.title")}</Heading>
        <Flex flexDirection="column" alignItems="flex-end">
          <Heading level={3} style={{ margin: 0 }}>{money(wastedCost)}</Heading>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
            {t("query.waste.kpi")} · {fmtGib(wastedGib)} · {fmtNum(wastePct)}%
          </Text>
        </Flex>
      </Flex>
      <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, lineHeight: 1.55 }}>
        {t("query.waste.body")}
      </Text>
      <DataTable data={rows} columns={columns} sortable resizable />
      <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
        {t("query.waste.topNote")}
      </Text>
      <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
        {t("query.waste.fix")}
      </Text>
    </Surface>
  );
};
