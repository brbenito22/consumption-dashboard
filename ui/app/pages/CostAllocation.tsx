import React, { useMemo, useState } from "react";
import { Surface, Flex, Grid, Divider } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { KpiCard } from "../components/KpiCard";
import { PageHeader } from "../components/PageHeader";
import { useCostAllocation, type AllocTile } from "../hooks/useCostAllocation";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { chartColor } from "../constants/palette";

const fmtNum = (v: number, d = 1) =>
  !isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * One team tile: name header box, total cost, and the capability breakdown
 * WITHIN that team (each capability with its cost). "unassigned" renders with
 * a neutral/gray accent. Layout mirrors the Billing tab's "Cost by Capability"
 * card family so the whole app reads as one system.
 */
const TeamTile: React.FC<{ tile: AllocTile; colorIndex: number }> = ({ tile, colorIndex }) => {
  const { money } = useCurrency();
  const { t } = useLang();
  const accent = tile.isUnassigned ? Colors.Text.Neutral.Subdued : chartColor(colorIndex);

  return (
    <Surface
      elevation="raised"
      style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 16px", position: "relative", overflow: "hidden" }}
    >
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: accent }} />

      {/* Header box — team / cost-center / product name */}
      <Surface elevation="flat" style={{ padding: "10px 12px" }}>
        <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Default, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {tile.isUnassigned ? t("alloc.unassigned") : tile.key}
        </Text>
      </Surface>

      {/* Team total cost */}
      <Heading level={3} style={{ margin: 0 }}>{money(tile.totalCost)}</Heading>

      {/* Capability breakdown inside the team */}
      <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Subdued, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {t("alloc.teamCapabilities")}
      </Text>
      <Flex flexDirection="column" gap={4}>
        {tile.capabilities.map((c) => (
          <Flex key={c.capability} justifyContent="space-between" alignItems="baseline" gap={8}>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>{c.capability}</Text>
            <Text textStyle="small-emphasized" style={{ color: Colors.Text.Neutral.Subdued }}>{money(c.cost)}</Text>
          </Flex>
        ))}
      </Flex>
    </Surface>
  );
};

export const CostAllocation: React.FC = () => {
  const { t } = useLang();
  const { money } = useCurrency();
  const alloc = useCostAllocation();
  const [axis, setAxis] = useState<"costcenter" | "product">("costcenter");

  const tiles = axis === "costcenter" ? alloc.tilesByCc : alloc.tilesByProduct;
  const allocatedTotal = useMemo(
    () => tiles.filter((tl) => !tl.isUnassigned).reduce((s, tl) => s + tl.totalCost, 0),
    [tiles],
  );

  const showEmpty = !alloc.isLoading && alloc.status === "unconfigured";

  return (
    <Flex flexDirection="column" gap={24} padding={24}>
      <PageHeader title={t("alloc.title")} subtitle={t("alloc.subtitle")} />

      {/* ── Not-configured empty state ──────────────────────────────────────── */}
      {showEmpty ? (
        <Surface elevation="flat" color="warning" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <Heading level={4} style={{ margin: 0 }}>{t("alloc.empty.title")}</Heading>
          <Text textStyle="base" style={{ color: Colors.Text.Neutral.Default, lineHeight: 1.55 }}>{t("alloc.empty.p1")}</Text>
          <Text textStyle="base-emphasized" style={{ color: Colors.Text.Neutral.Default }}>{t("alloc.empty.p2")}</Text>
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            <li><Text textStyle="small">{t("alloc.empty.step1")}</Text></li>
            <li><Text textStyle="small">{t("alloc.empty.step2")}</Text></li>
          </ol>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>{t("alloc.empty.note")}</Text>
        </Surface>
      ) : (
        <>
          {/* Coverage summary + axis toggle */}
          <Flex justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={12}>
            <Flex gap={12} flexWrap="wrap">
              <KpiCard
                label={t("alloc.coverage")}
                value={alloc.isLoading ? "…" : `${fmtNum(alloc.coverage * 100)}%`}
                subLabel={`${money(allocatedTotal)} ${t("alloc.allocated")}`}
                isLoading={alloc.isLoading}
                colorVariant={alloc.coverage >= 0.8 ? "positive" : alloc.coverage >= 0.4 ? "warning" : "critical"}
              />
              <KpiCard
                label={axis === "costcenter" ? t("alloc.byCostCenter") : t("alloc.byProduct")}
                value={alloc.isLoading ? "…" : String(tiles.filter((tl) => !tl.isUnassigned).length)}
                subLabel={t("alloc.title")}
                isLoading={alloc.isLoading}
              />
            </Flex>
            <Flex gap={8}>
              <Button variant={axis === "costcenter" ? "emphasized" : "default"} onClick={() => setAxis("costcenter")}>{t("alloc.byCostCenter")}</Button>
              <Button variant={axis === "product" ? "emphasized" : "default"} onClick={() => setAxis("product")}>{t("alloc.byProduct")}</Button>
            </Flex>
          </Flex>

          <Divider />

          {/* Team tiles */}
          <Grid gridTemplateColumns="repeat(auto-fit, minmax(260px, 1fr))" gap={12}>
            {(alloc.isLoading ? [] : tiles).map((tile, idx) => (
              <TeamTile key={`${axis}-${tile.key}`} tile={tile} colorIndex={idx} />
            ))}
            {alloc.isLoading && <Text>Loading…</Text>}
          </Grid>
        </>
      )}
    </Flex>
  );
};
