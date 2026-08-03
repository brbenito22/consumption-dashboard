import React from "react";
import { Surface, Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { KpiCard } from "./KpiCard";
import { ConsumptionChart } from "./ConsumptionChart";
import { useRateCard } from "../hooks/useRateCard";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { fmtHours, fmtDelta } from "../utils/format";

interface BillingTrendSectionProps {
  series: Array<{ timestamp: number; value: number }>;
  isLoading: boolean;
  chartError: string | null;
  deltaError: string | null;
  totalDelta: { pct: number | null; isNew: boolean };
  /** Previous-30d total shown under the delta KPI. */
  prevTotal: number;
  windowHours: number;
  binInterval: string;
}

/**
 * "Cost over time" section (Billing tab): the trend chart, the 30d-vs-30d
 * delta KPI and the "ingest down but cost flat" explanation box.
 */
export const BillingTrendSection: React.FC<BillingTrendSectionProps> = ({
  series, isLoading, chartError, deltaError, totalDelta, prevTotal, windowHours, binInterval,
}) => {
  const rateCard = useRateCard();
  const { money } = useCurrency();
  const { t } = useLang();

  return (
    <Flex flexDirection="column" gap={12}>
      <Flex justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={12}>
        <Flex flexDirection="column" gap={4}>
          <Heading level={3}>{t("billing.trend.title")}</Heading>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, maxWidth: 680 }}>
            {t("billing.trend.subtitle", { bin: binInterval })}
          </Text>
        </Flex>
        <KpiCard
          label={t("billing.delta30")}
          value={isLoading ? "…" : totalDelta.isNew ? t("delta.new") : fmtDelta(totalDelta.pct)}
          subLabel={
            isLoading
              ? ""
              : totalDelta.pct !== null
                ? t("billing.trend.deltaSub", { prev: money(prevTotal) })
                : t("billing.trend.noPrev")
          }
          isLoading={isLoading}
          error={deltaError}
          colorVariant={totalDelta.pct !== null && totalDelta.pct > 0.5 ? "warning" : "positive"}
        />
      </Flex>
      <ConsumptionChart
        title={`${t("billing.trend.title")} — ${fmtHours(windowHours)}`}
        series={series}
        unit={rateCard.officialCost?.currency || rateCard.currency}
        isLoading={isLoading}
        error={chartError}
        height={220}
      />
      {/* Why "ingest down but cost flat" happens — the client's exact question. */}
      <Surface elevation="flat" color="primary" style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
        <Heading level={6} style={{ margin: 0 }}>{t("billing.why.title")}</Heading>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, lineHeight: 1.5 }}>{t("billing.why.p1")}</Text>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, lineHeight: 1.5 }}>{t("billing.why.p2")}</Text>
      </Surface>
    </Flex>
  );
};
