import React, { useMemo } from "react";
import { Sheet } from "@dynatrace/strato-components-preview/overlays";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import { Button } from "@dynatrace/strato-components/buttons";
import { Surface, Flex, Grid } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { KpiCard } from "../components/KpiCard";
import { ConsumptionChart } from "../components/ConsumptionChart";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { chartColor } from "../constants/palette";
import { descriptionFor } from "../constants/capabilityInfo";
import type { CapabilityCost, CostTrendPoint } from "../utils/costEngine";
import type { TimeRangeOption } from "../types";

interface CapabilityDetailSheetProps {
  /** Selected capability row (from the Billing breakdown). `null` closes the sheet. */
  capability: CapabilityCost | null;
  /** Chronological cost/quantity points for this capability (current window). */
  series: CostTrendPoint[];
  /** Cost of this capability over the LAST 30 days (Account-Management-style basis). */
  cost30: number | null;
  /** Cost of this capability over the PREVIOUS 30 days (60d→30d ago). */
  prevCost30: number | null;
  /** Palette index — keeps the sheet's charts the same color as the card. */
  colorIndex: number;
  timeRange: TimeRangeOption;
  onDismiss: () => void;
}

interface BinRow {
  interval: string;
  cost_fmt: string;
  qty_fmt: string;
  delta_fmt: string;
}

const fmtNum = (v: number, d = 2) =>
  !isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtDelta = (pct: number | null): string => {
  if (pct === null || !isFinite(pct)) return "—";
  const arrow = pct > 0.5 ? "▲" : pct < -0.5 ? "▼" : "＝";
  return `${arrow} ${pct > 0 ? "+" : ""}${fmtNum(pct, 1)}%`;
};

/**
 * Per-capability drill-down: cost trend, billed-quantity trend and a
 * per-interval comparison table. Modeled on CloudServiceSheet, but fully
 * presentational — all data arrives via props from BillingOverview's two
 * dt.system.events queries, so opening the sheet triggers NO extra Grail scan.
 */
export const CapabilityDetailSheet: React.FC<CapabilityDetailSheetProps> = ({
  capability,
  series,
  cost30,
  prevCost30,
  colorIndex,
  timeRange,
  onDismiss,
}) => {
  const { money } = useCurrency();
  const { t, lang } = useLang();

  // 30d-vs-previous-30d basis (Account Management style). "new" floor: deltas
  // against a period with < R$1 are noise, not growth.
  const delta = useMemo(() => {
    const c = cost30 ?? 0;
    const p = prevCost30 ?? 0;
    if (p <= 1) return { pct: null as number | null, isNew: c > 1 };
    return { pct: ((c - p) / p) * 100, isNew: false };
  }, [cost30, prevCost30]);

  const costSeries = useMemo(
    () => series.map((p) => ({ timestamp: p.timestamp, value: p.cost })),
    [series],
  );
  const qtySeries = useMemo(
    () => series.map((p) => ({ timestamp: p.timestamp, value: p.quantity })),
    [series],
  );

  // Per-interval table with bin-over-bin delta — the "compare days/hours" ask.
  const binRows: BinRow[] = useMemo(() => {
    const rows: BinRow[] = [];
    for (let i = 0; i < series.length; i++) {
      const p = series[i];
      const prev = i > 0 ? series[i - 1] : null;
      const pct = prev && prev.cost > 0 ? ((p.cost - prev.cost) / prev.cost) * 100 : null;
      rows.push({
        interval: new Date(p.timestamp).toLocaleString(),
        cost_fmt: money(p.cost),
        qty_fmt: `${fmtNum(p.quantity, 2)} ${capability?.unitLabel ?? ""}`,
        delta_fmt: fmtDelta(pct),
      });
    }
    return rows.reverse(); // newest first
  }, [series, money, capability?.unitLabel]);

  const binColumns = useMemo(
    () => [
      { header: t("capsheet.colInterval"), accessor: "interval"  },
      { header: t("capsheet.colCost"),     accessor: "cost_fmt"  },
      { header: t("capsheet.colQty"),      accessor: "qty_fmt"   },
      { header: t("capsheet.colDelta"),    accessor: "delta_fmt" },
    ],
    [t],
  );

  const isOpen = Boolean(capability);
  const color = chartColor(colorIndex);
  const windowLabel = timeRange.label.replace(/^Last /, "").trim();

  return (
    <Sheet
      show={isOpen}
      onDismiss={onDismiss}
      title={capability?.capability ?? ""}
      actions={<Button variant="default" onClick={onDismiss}>{t("capsheet.close")}</Button>}
    >
      {isOpen && capability && (
        <Flex flexDirection="column" gap={16} padding={16}>

          {/* Plain-language origin of this cost — first thing the reader sees. */}
          <Surface elevation="flat" color="primary" style={{ padding: "12px 14px" }}>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, lineHeight: 1.5 }}>
              {descriptionFor(capability.capability, lang)}
            </Text>
          </Surface>

          {/* KPI strip: window cost, last 30d, 30d delta, quantity, price */}
          <Grid gridTemplateColumns="repeat(auto-fit, minmax(170px, 1fr))" gap={12}>
            <KpiCard
              label={t("capsheet.costWindow")}
              value={money(capability.cost)}
              subLabel={windowLabel}
            />
            <KpiCard
              label={t("billing.last30")}
              value={cost30 !== null ? money(cost30) : "—"}
              subLabel={t("billing.delta30")}
            />
            <KpiCard
              label={t("billing.delta30")}
              value={delta.isNew ? t("delta.new") : fmtDelta(delta.pct)}
              subLabel={prevCost30 !== null ? t("billing.trend.deltaSub", { prev: money(prevCost30) }) : t("billing.trend.noPrev")}
              colorVariant={delta.isNew || (delta.pct !== null && delta.pct > 0.5) ? "warning" : "positive"}
            />
            <KpiCard
              label={t("capsheet.quantity")}
              value={fmtNum(capability.quantity, 2)}
              subLabel={capability.unitLabel}
            />
            <KpiCard
              label={t("capsheet.price")}
              value={money(capability.pricePerUnit)}
              subLabel={`/ ${capability.unitLabel.replace(/s$/, "")}`}
            />
          </Grid>

          {/* Cost + quantity trends — ingest may fall while cost stays flat;
              showing both lines side by side is what makes that visible. */}
          <ConsumptionChart
            title={t("capsheet.costOverTime")}
            series={costSeries}
            unit={money(0).replace(/[\d.,\s]/g, "") || "cost"}
            color={color}
            height={180}
          />
          <ConsumptionChart
            title={t("capsheet.qtyOverTime")}
            series={qtySeries}
            unit={capability.unitLabel}
            color={color}
            height={180}
          />

          {/* Per-interval comparison table (newest first) */}
          <Flex flexDirection="column" gap={8}>
            <Heading level={5} style={{ margin: 0 }}>{t("capsheet.binTable")}</Heading>
            <DataTable data={binRows} columns={binColumns} sortable resizable />
          </Flex>

          <Surface elevation="flat" color="primary" style={{ padding: "12px 14px" }}>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
              {t("capsheet.note")}
            </Text>
          </Surface>
        </Flex>
      )}
    </Sheet>
  );
};
