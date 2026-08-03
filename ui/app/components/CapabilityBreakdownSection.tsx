import React, { useMemo, useState } from "react";
import { Surface, Flex, Grid } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useRateCard } from "../hooks/useRateCard";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { fmtNum, fmtDelta } from "../utils/format";
import { deltaOrNew, type CostBreakdown, type CapabilityCost } from "../utils/costEngine";
import { descriptionFor } from "../constants/capabilityInfo";
import { normalizeCapabilityName } from "../constants/rateCard";
import { chartColor } from "../constants/palette";

interface CapabilityBreakdownSectionProps {
  breakdown: CostBreakdown;
  loading: boolean;
  /** Grail-estimated total for the period (share basis when no official cost). */
  periodCost: number;
  /** Grail-estimated last-30d / previous-30d cost per capability (fallbacks). */
  last30ByCap: Map<string, number>;
  prev30ByCap: Map<string, number>;
  /** Open the per-capability drill-down sheet. */
  onSelect: (capability: string) => void;
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 8, borderRadius: 4, background: "var(--dt-color-border-neutral-subtle)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 4, transition: "width 0.4s ease" }} />
    </div>
  );
}

/** Resolved display numbers for one capability row (see `resolve` below). */
interface ResolvedRow {
  official: { periodTotal: number; last30: number | null; prev30: number | null } | undefined;
  cost: number;
  c30: number | null;
  d: { pct: number | null; isNew: boolean };
  share: number;
}

/** Color for a delta badge: up = warning, down = success, flat = subdued. */
function deltaColor(d: { pct: number | null; isNew: boolean }): string {
  if (d.isNew || (d.pct !== null && d.pct > 0.5)) return Colors.Text.Warning.Default;
  if (d.pct !== null && d.pct < -0.5) return Colors.Text.Success.Default;
  return Colors.Text.Neutral.Subdued;
}

/**
 * One capability cost card. Clickable (opening the drill-down sheet) only when
 * the capability actually has billable cost — either a priced Grail quantity or
 * a non-zero official figure.
 */
const CapabilityCard: React.FC<{
  row: CapabilityCost;
  color: string;
  resolved: ResolvedRow;
  costCell: string;
  subCell: string;
  onSelect: (capability: string) => void;
}> = ({ row, color, resolved, costCell, subCell, onSelect }) => {
  const { money } = useCurrency();
  const { t, lang } = useLang();
  const { official, cost, c30, d, share } = resolved;

  const clickable = (!row.unmatched && row.quantity > 0) || (official !== undefined && official.periodTotal > 0);
  const delta = clickable ? d : { pct: null, isNew: false };
  const priced = !row.unmatched && row.quantity > 0;

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onSelect(row.capability) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") onSelect(row.capability); } : undefined}
      style={{ cursor: clickable ? "pointer" : "default", display: "flex" }}
    >
      <Surface
        elevation="raised"
        style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px", position: "relative", overflow: "hidden", flex: 1 }}
      >
        <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: row.unmatched ? Colors.Text.Neutral.Subdued : color }} />
        <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Subdued, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {row.capability}
        </Text>
        <Flex justifyContent="space-between" alignItems="baseline" gap={8}>
          <Heading level={3} style={{ margin: 0 }}>
            {official ? money(cost) : costCell}
          </Heading>
          {(delta.pct !== null || delta.isNew) && (
            <Text textStyle="small-emphasized" title={t("billing.delta30")} style={{ color: deltaColor(delta) }}>
              {delta.isNew ? t("delta.new") : fmtDelta(delta.pct)}
            </Text>
          )}
        </Flex>
        {clickable && c30 !== null && (
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
            {t("billing.last30")}: <strong>{money(c30)}</strong>
          </Text>
        )}
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>{subCell}</Text>
        {priced && (
          <>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, lineHeight: 1.4 }}>
              {descriptionFor(row.capability, lang)}
            </Text>
            <ProgressBar pct={share} color={color} />
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>{fmtNum(share, 1)}% of total cost</Text>
          </>
        )}
      </Surface>
    </div>
  );
};

/**
 * "Cost by Capability" (Billing tab): cards ⇄ table toggle, CSV export and the
 * per-capability delta badges. Prefers the OFFICIAL per-capability cost from
 * the Subscription API and falls back to the Grail × rate-card estimate.
 * Extracted from BillingOverview — this section alone was the single biggest
 * complexity hotspot in the app (CC 37 render callback).
 */
export const CapabilityBreakdownSection: React.FC<CapabilityBreakdownSectionProps> = ({
  breakdown, loading, periodCost, last30ByCap, prev30ByCap, onSelect,
}) => {
  const rateCard = useRateCard();
  const { money, unitPrice } = useCurrency();
  const { t, lang } = useLang();
  const [capView, setCapView] = useState<"cards" | "table">("cards");

  const officialFor = (cap: string) => rateCard.officialByCap.get(normalizeCapabilityName(cap));
  const hasOfficialCaps = rateCard.officialByCap.size > 0;
  const totalForShare = hasOfficialCaps && rateCard.officialCost ? rateCard.officialCost.total : periodCost;

  /** Resolved display numbers for one row — single source for cards, table and CSV. */
  const resolve = (row: CapabilityCost) => {
    const o = officialFor(row.capability);
    const cost = o ? o.periodTotal : row.cost;
    const c30 = (o?.last30 ?? last30ByCap.get(row.capability)) ?? null;
    const d = deltaOrNew(c30 ?? undefined, (o?.prev30 ?? prev30ByCap.get(row.capability)) ?? undefined);
    const share = totalForShare > 0 ? (cost / totalForShare) * 100 : 0;
    return { official: o, cost, c30, d, share };
  };

  // ── Honest per-capability cost display ─────────────────────────────────────
  const costCell = (row: CapabilityCost) => {
    if (row.unmatched) return "—";
    if (row.quantity === 0) return "—";
    if (row.cost < 0.005) return `< ${money(0.01)}`;
    return money(row.cost);
  };
  const subCell = (row: CapabilityCost) => {
    if (row.unmatched) return "no rate card match";
    if (row.quantity === 0) return "no billable usage this period";
    return `${fmtNum(row.quantity, 2)} ${row.unitLabel} · ${unitPrice(row.pricePerUnit)}/${row.unitLabel.replace(/s$/, "")}`;
  };
  const zeroUsageCount = breakdown.rows.filter((r) => !r.unmatched && r.quantity === 0).length;

  // ── Table view + CSV export (mirrors Account Management's table) ───────────
  const tableRows = useMemo(
    () => breakdown.rows.filter((r) => !r.unmatched).map((r) => {
      const { cost, c30, d, share } = resolve(r);
      return {
        capability: r.capability,
        period_fmt: money(cost),
        last30_fmt: c30 !== null ? money(c30) : "—",
        delta_fmt: d.isNew ? t("delta.new") : fmtDelta(d.pct),
        share_fmt: `${fmtNum(share, 1)}%`,
      };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [breakdown.rows, last30ByCap, prev30ByCap, periodCost, money, t, rateCard.officialByCap, rateCard.officialCost],
  );
  const tableColumns = useMemo(
    () => [
      { header: "Capability",                accessor: "capability" },
      { header: "Billing period",            accessor: "period_fmt" },
      { header: t("billing.last30"),         accessor: "last30_fmt" },
      { header: `Δ ${t("billing.delta30")}`, accessor: "delta_fmt"  },
      { header: "% of total",                accessor: "share_fmt"  },
    ],
    [t],
  );
  const exportCsv = () => {
    const header = "capability,billing_period_cost,last_30d_cost,delta_30d_pct,share_pct";
    const lines = breakdown.rows.filter((r) => !r.unmatched).map((r) => {
      const { cost, c30, d, share } = resolve(r);
      return `"${r.capability.replace(/"/g, '""')}",${cost.toFixed(2)},${(c30 ?? 0).toFixed(2)},${d.isNew ? "new" : d.pct !== null ? d.pct.toFixed(1) : ""},${share.toFixed(1)}`;
    });
    const blob = new Blob([`${header}\n${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cost-by-capability.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Flex flexDirection="column" gap={12}>
      <Flex justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={8}>
        <Heading level={3}>Cost by Capability</Heading>
        <Flex gap={8}>
          <Button variant={capView === "cards" ? "emphasized" : "default"} onClick={() => setCapView("cards")}>{t("billing.view.cards")}</Button>
          <Button variant={capView === "table" ? "emphasized" : "default"} onClick={() => setCapView("table")}>{t("billing.view.table")}</Button>
          <Button variant="default" onClick={exportCsv}>{t("billing.exportCsv")}</Button>
        </Flex>
      </Flex>
      <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
        {t("billing.cards.hint")}
      </Text>

      {capView === "table" && (
        <DataTable data={tableRows} columns={tableColumns} sortable resizable />
      )}
      {capView === "cards" && (
        <Grid gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))" gap={12}>
          {(loading ? [] : breakdown.rows).map((row, idx) => (
            <CapabilityCard
              key={row.capability}
              row={row}
              color={chartColor(idx)}
              resolved={resolve(row)}
              costCell={costCell(row)}
              subCell={subCell(row)}
              onSelect={onSelect}
            />
          ))}
          {loading && <Text>Loading…</Text>}
        </Grid>
      )}

      {(zeroUsageCount > 0 || breakdown.unmatchedCount > 0) && !loading && (
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, maxWidth: 760 }}>
          Capabilities marked <strong>"—"</strong> have billing events but no billable quantity (GiB, GiB-hours or
          host-hours) reported in this period — typical of trial/sprint environments or capabilities measured in
          units not exposed here. Values under {money(0.01)} are shown as "&lt; {money(0.01)}".
        </Text>
      )}
    </Flex>
  );
};
