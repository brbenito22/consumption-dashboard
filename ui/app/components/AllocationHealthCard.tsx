import React from "react";
import { KpiCard } from "./KpiCard";
import { useCostAllocation } from "../hooks/useCostAllocation";
import { useLang } from "../context/LanguageContext";

const fmtPct = (v: number) => `${(v * 100).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/**
 * Overview health tile — cost-allocation coverage. Reuses useCostAllocation
 * (dt.system.events, ~0 GB, cache-shared with the Cost Allocation tab), so it
 * adds no scan. Shows "not configured" when every event is unassigned.
 */
export const AllocationHealthCard: React.FC = () => {
  const { t } = useLang();
  const alloc = useCostAllocation();

  const configured = alloc.status !== "unconfigured";
  return (
    <KpiCard
      label={t("alloc.health.title")}
      value={alloc.isLoading ? "…" : configured ? fmtPct(alloc.coverage) : t("alloc.health.notConfigured")}
      subLabel={configured ? t("alloc.coverage") : t("alloc.title")}
      isLoading={alloc.isLoading}
      colorVariant={!configured ? "warning" : alloc.coverage >= 0.8 ? "positive" : "warning"}
    />
  );
};
