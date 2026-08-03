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
  /** Annual run-rate projection — used to sanity-check the commitment's scale. */
  annualProjection: number;
}

/**
 * A commitment is entered by hand, and the most common slip is pasting the
 * MONTHLY figure into an annual field. When the annual run-rate lands near 12x
 * the commitment, that is the likelier explanation than a customer consuming
 * twelve times what they contracted — so the panel says so instead of shouting
 * a red "over budget" that may be an artifact of the typo.
 */
function looksLikeMonthlyValue(commitment: number, annualProjection: number): boolean {
  if (commitment <= 0 || annualProjection <= 0) return false;
  const ratio = annualProjection / commitment;
  return ratio >= 8 && ratio <= 16;
}

/**
 * Budget vs annual commitment (Billing tab) — mirrors Account Management.
 * Renders nothing when the subscription exposes no budget. Owns all
 * budget-derived math (used %, days left, commitment-reached date).
 */
/** The four budget KPIs — split out so the panel stays under the complexity gate. */
const BudgetKpis: React.FC<{
  commitment: number;
  commitmentSource: string;
  officialTotal: number | null;
  usedPct: number | null;
  daysLeft: number | null;
  periodEnd: string | null;
  reachedOn: string | null;
  over: boolean;
}> = ({ commitment, commitmentSource, officialTotal, usedPct, daysLeft, periodEnd, reachedOn, over }) => {
  const { money } = useCurrency();
  const { t } = useLang();
  const usedVariant = over ? "critical" : usedPct !== null && usedPct >= 80 ? "warning" : "positive";

  return (
    <Grid gridTemplateColumns="repeat(auto-fit, minmax(190px, 1fr))" gap={12}>
      <KpiCard
        label={t("budget.commitment")}
        value={money(commitment)}
        subLabel={commitmentSource === "settings" ? t("budget.sourceSettings") : "Subscription API"}
      />
      <KpiCard
        label={t("budget.used")}
        value={usedPct !== null ? `${fmtNum(usedPct, 1)}%` : "—"}
        subLabel={officialTotal !== null ? `${money(officialTotal)} / ${money(commitment)}` : ""}
        colorVariant={usedVariant}
      />
      {daysLeft !== null && (
        <KpiCard label={t("budget.daysLeft")} value={String(daysLeft)} subLabel={periodEnd ?? ""} />
      )}
      <KpiCard
        label={reachedOn ? t("budget.reachedOn", { date: reachedOn }) : t("budget.notReached")}
        value={over ? "⚠" : "✓"}
        colorVariant={over ? "critical" : "positive"}
      />
    </Grid>
  );
};

export const BudgetPanel: React.FC<BudgetPanelProps> = ({ trendTotal, annualProjection }) => {
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
  const scaleSuspect = looksLikeMonthlyValue(budget.commitment, annualProjection);

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
      <BudgetKpis
        commitment={budget.commitment}
        commitmentSource={budget.source}
        officialTotal={officialTotal}
        usedPct={budgetUsedPct}
        daysLeft={budgetDaysLeft}
        periodEnd={budget.periodEnd ?? null}
        reachedOn={commitmentReached}
        over={over}
      />
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
      {over && !scaleSuspect && (
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>{t("budget.overText")}</Text>
      )}
      {scaleSuspect && (
        <Text textStyle="small" style={{ color: Colors.Text.Warning.Default, lineHeight: 1.5 }}>
          {t("budget.scaleSuspect", {
            ratio: fmtNum(annualProjection / budget.commitment, 1),
            annual: money(budget.commitment * 12),
          })}
        </Text>
      )}
    </Surface>
  );
};
