import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { KpiCard } from "./KpiCard";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { fmtNum, fmtGib, fmtInt } from "../utils/format";
import type { QueryCostState } from "../hooks/useQueryCost";

/** Reconciliation caption: "✓ matches" when within 1%, signed delta otherwise. */
function reconLabel(reconPct: number | null, t: (k: "query.recon.match" | "query.recon.off") => string): string | undefined {
  if (reconPct === null) return undefined;
  if (Math.abs(reconPct) < 1) return `✓ ${t("query.recon.match")}`;
  return `${reconPct > 0 ? "+" : ""}${fmtNum(reconPct)}% ${t("query.recon.off")}`;
}

/**
 * Headline KPI row for the Query Cost tab: total spend (with its
 * reconciliation against the official figure), the official cost itself when
 * exposed, scanned volume, query count, and the two "shape" signals — average
 * and largest single query — that tell a badly written query from a busy one.
 */
export const QueryCostKpis: React.FC<{ q: QueryCostState }> = ({ q }) => {
  const { money } = useCurrency();
  const { t } = useLang();

  const avgAll = q.totalQueries > 0 ? q.totalGib / q.totalQueries : 0;

  return (
    <Flex gap={12} flexWrap="wrap">
      <KpiCard
        label={t("query.total")}
        value={q.isLoading ? "…" : money(q.totalCost)}
        subLabel={reconLabel(q.reconPct, t)}
        isLoading={q.isLoading}
        error={q.error}
      />
      {q.officialQueryCost !== null && (
        <KpiCard
          label={t("query.official")}
          value={money(q.officialQueryCost)}
          subLabel="Subscription API"
          colorVariant="positive"
        />
      )}
      <KpiCard label={t("query.scanned")} value={q.isLoading ? "…" : fmtGib(q.totalGib)} isLoading={q.isLoading} />
      <KpiCard label={t("query.count")} value={q.isLoading ? "…" : fmtInt(q.totalQueries)} isLoading={q.isLoading} />
      <KpiCard
        label={t("query.avg")}
        value={q.isLoading ? "…" : fmtGib(avgAll)}
        isLoading={q.isLoading}
        colorVariant={avgAll >= 10 ? "warning" : "positive"}
      />
      <KpiCard
        label={t("query.biggest")}
        value={q.isLoading ? "…" : fmtGib(q.maxGib)}
        isLoading={q.isLoading}
        colorVariant={q.maxGib >= 100 ? "critical" : q.maxGib >= 10 ? "warning" : "positive"}
      />
      {q.aiQueries > 0 && (
        <KpiCard label={t("query.ai")} value={q.isLoading ? "…" : fmtInt(q.aiQueries)} isLoading={q.isLoading} />
      )}
    </Flex>
  );
};
