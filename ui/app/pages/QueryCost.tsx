import React, { useState } from "react";
import { Surface, Flex, Divider } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { PageHeader } from "../components/PageHeader";
import { QueryCostKpis } from "../components/QueryCostKpis";
import { RepeatedQueryPanel } from "../components/RepeatedQueryPanel";
import { QuerySpenderTable, type SpenderAxis } from "../components/QuerySpenderTable";
import { useQueryCost } from "../hooks/useQueryCost";
import { useLang } from "../context/LanguageContext";

/**
 * Query Cost tab — Grail query spend attributed to the dashboard, user and app
 * that ran it, plus the recoverable waste from mechanically repeated queries.
 * Account Management reports this as a single lump per capability; the billing
 * usage events carry the attribution, so the same ~0 GB scan answers "who".
 */
export const QueryCost: React.FC = () => {
  const { t } = useLang();
  const q = useQueryCost();
  const [axis, setAxis] = useState<SpenderAxis>("dashboard");

  const spenders = axis === "user" ? q.byUser : axis === "app" ? q.byApp : q.byDashboard;
  const wastePct = q.totalCost > 0 ? (q.wastedCost / q.totalCost) * 100 : 0;
  const isEmpty = !q.isLoading && q.totalQueries === 0;

  return (
    <Flex flexDirection="column" gap={24} padding={24}>
      <PageHeader title={t("query.title")} subtitle={t("query.subtitle")} />

      {isEmpty ? (
        <Surface elevation="flat" color="primary" style={{ padding: "20px 24px" }}>
          <Text textStyle="base">{t("query.empty")}</Text>
        </Surface>
      ) : (
        <>
          <QueryCostKpis q={q} />

          {!q.isLoading && q.repeated.length > 0 && (
            <RepeatedQueryPanel
              repeated={q.repeated}
              wastedCost={q.wastedCost}
              wastedGib={q.wastedGib}
              wastePct={wastePct}
            />
          )}

          <Divider />

          <QuerySpenderTable
            axis={axis}
            onAxisChange={setAxis}
            spenders={spenders}
            totalCost={q.totalCost}
            isLoading={q.isLoading}
          />

          {/* ── Fair-use note ───────────────────────────────────────────────── */}
          <Surface elevation="flat" color="primary" style={{ padding: "14px 18px" }}>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, lineHeight: 1.55 }}>
              {t("query.privacy")}
            </Text>
          </Surface>
        </>
      )}
    </Flex>
  );
};
