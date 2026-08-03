import React, { useMemo } from "react";
import { Surface, Flex, Grid } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { KpiCard } from "./KpiCard";
import { useRateCard } from "../hooks/useRateCard";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { fmtNum } from "../utils/format";
import type { CostTrendPoint } from "../utils/costEngine";

interface BudgetPanelProps {
  /** Chronological total-cost points for the billing period — used to
   *  estimate the date the cumulative cost crossed the commitment. */
  trendTotal: CostTrendPoint[];
}

/**
 * Budget vs annual commitment (Billing tab) — mirrors Account Management.
 * Renders nothing when the subscription exposes no budget. Owns all
 * budget-derived math (used %, days left, commitment-reached date).
 */
export const BudgetPanel: React.FC<BudgetPanelProps> = ({ trendTotal }) => {
  const rateCard = useRateCard();
  const { money } = useCurrency();
  const { t } = useLang();

  const budget = rateCard.officialBudget;
  const officialTotal = rateCard.officialCost?.total ?? null;

  const budgetUsedPct = budget && officialTotal !== null
    ? (officialTotal / budget.commitment) * 100
    : null;

  const budgetDaysLeft = useMemo(() => {
    if (!budget?.periodEnd) return null;
    const end = new Date(`${budget.periodEnd}T00:00:00Z`).getTime();
    if (!isFinite(end)) return null;
    return Math.max(0, Math.round((end - Date.now()) / 86_400_000));
  }, [budget?.periodEnd]);

  // Estimated date the cumulative billing-period cost crossed the commitment.
  const commitmentReached = useMemo(() => {
    if (!budget || trendTotal.length === 0) return null;
    let acc = 0;
    for (const p of trendTotal) {
      acc += p.cost;
      if (acc >= budget.commitment) return new Date(p.timestamp).toISOString().slice(0, 10);
    }
    return null;
  }, [budget, trendTotal]);

  if (!budget) return null;
  const over = budgetUsedPct !== null && budgetUsedPct >= 100;

  return (
    <Surface
      elevation="flat"
      color={over ? "critical" : "primary"}
      style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}
    >
      <Flex justifyContent="space-between" alignItems="baseline" flexWrap="wrap" gap={8}>
        <Heading level={4} style={{ margin: 0 }}>{t("budget.title")}</Heading>
        {budget.periodStart && budget.periodEnd && (
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
            {t("budget.periodLabel")}: {budget.periodStart} → {budget.periodEnd}
          </Text>
        )}
      </Flex>
      <Grid gridTemplateColumns="repeat(auto-fit, minmax(190px, 1fr))" gap={12}>
        <KpiCard label={t("budget.commitment")} value={money(budget.commitment)} subLabel={budget.source === "settings" ? t("budget.sourceSettings") : "Subscription API"} />
        <KpiCard
          label={t("budget.used")}
          value={budgetUsedPct !== null ? `${fmtNum(budgetUsedPct, 1)}%` : "—"}
          subLabel={officialTotal !== null ? `${money(officialTotal)} / ${money(budget.commitment)}` : ""}
          colorVariant={over ? "critical" : budgetUsedPct !== null && budgetUsedPct >= 80 ? "warning" : "positive"}
        />
        {budgetDaysLeft !== null && (
          <KpiCard label={t("budget.daysLeft")} value={String(budgetDaysLeft)} subLabel={budget.periodEnd ?? ""} />
        )}
        <KpiCard
          label={commitmentReached ? t("budget.reachedOn", { date: commitmentReached }) : t("budget.notReached")}
          value={over ? "⚠" : "✓"}
          colorVariant={over ? "critical" : "positive"}
        />
      </Grid>
      {budgetUsedPct !== null && (
        <div style={{ height: 10, borderRadius: 5, background: "var(--dt-color-border-neutral-subtle)", overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${Math.min(budgetUsedPct, 100)}%`,
            background: over ? Colors.Border.Critical.Default : budgetUsedPct >= 80 ? Colors.Border.Warning.Default : Colors.Border.Success.Default,
            borderRadius: 5,
          }} />
        </div>
      )}
      {over && (
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>{t("budget.overText")}</Text>
      )}
    </Surface>
  );
};
