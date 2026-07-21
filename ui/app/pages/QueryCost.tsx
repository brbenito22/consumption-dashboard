import React, { useMemo, useState } from "react";
import { Surface, Flex, Grid, Divider } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { KpiCard } from "../components/KpiCard";
import { PageHeader } from "../components/PageHeader";
import { useQueryCost } from "../hooks/useQueryCost";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { dashboardUrl } from "../utils/settingsLink";

const fmtNum = (v: number, d = 1) =>
  !isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtGib = (v: number) =>
  !isFinite(v) ? "—"
    : v >= 1024 ? `${fmtNum(v / 1024, 2)} TiB`
    : v >= 1 ? `${fmtNum(v, 1)} GiB`
    : `${fmtNum(v * 1024, 0)} MiB`;

const fmtInt = (v: number) => (!isFinite(v) ? "—" : Math.round(v).toLocaleString("en-US"));

/** "16/07 21:31 → 17/07 19:43" — compact enough for a table cell. */
const fmtWindow = (from: string, to: string) => {
  const d = (s: string) => {
    const t = new Date(s).getTime();
    if (!isFinite(t)) return "—";
    return new Date(t).toISOString().slice(5, 16).replace("T", " ").replace("-", "/");
  };
  return `${d(from)} → ${d(to)}`;
};

export const QueryCost: React.FC = () => {
  const { t } = useLang();
  const { money } = useCurrency();
  const q = useQueryCost();
  const [axis, setAxis] = useState<"user" | "app" | "dashboard">("dashboard");

  const spenders = axis === "user" ? q.byUser : axis === "app" ? q.byApp : q.byDashboard;

  const spenderRows = useMemo(
    () =>
      spenders.map((s) => ({
        key: s.key,
        cost_fmt: money(s.cost),
        share_fmt: q.totalCost > 0 ? `${fmtNum((s.cost / q.totalCost) * 100)}%` : "—",
        gib_fmt: fmtGib(s.gib),
        queries_fmt: fmtInt(s.queries),
        avg_fmt: fmtGib(s.avgGib),
        max_fmt: fmtGib(s.maxGib),
        viewers_fmt: "viewers" in s ? fmtInt((s as { viewers: number }).viewers) : "—",
      })),
    [spenders, q.totalCost, money],
  );

  const spenderColumns = useMemo(() => {
    const keyHeader = axis === "user" ? t("query.user") : axis === "app" ? t("query.app") : t("query.dashboard");
    const keyCol =
      axis === "dashboard"
        ? {
            header: keyHeader,
            accessor: "key",
            // The id doubles as a deep link — the whole point of this axis is
            // jumping to the offending dashboard to fix its tiles.
            cell: ({ value }: { value: unknown }) => (
              <a
                href={dashboardUrl(String(value))}
                target="_blank"
                rel="noreferrer"
                style={{ color: Colors.Text.Primary.Default, fontFamily: "monospace", fontSize: 12 }}
              >
                {String(value)}
              </a>
            ),
          }
        : { header: keyHeader, accessor: "key" };
    return [
      keyCol,
      { header: t("query.cost"), accessor: "cost_fmt" },
      { header: t("query.share"), accessor: "share_fmt" },
      { header: t("query.scanned"), accessor: "gib_fmt" },
      { header: t("query.count"), accessor: "queries_fmt" },
      { header: t("query.avg"), accessor: "avg_fmt" },
      { header: t("query.biggest"), accessor: "max_fmt" },
      ...(axis === "dashboard" ? [{ header: t("query.viewers"), accessor: "viewers_fmt" }] : []),
    ];
  }, [axis, t]);

  const wasteRows = useMemo(
    () =>
      q.repeated.map((r) => ({
        actor: r.actor,
        app: r.app,
        each_fmt: fmtGib(r.gibEach),
        repeats_fmt: fmtInt(r.repeats),
        wasted_gib_fmt: fmtGib(r.wastedGib),
        wasted_cost_fmt: money(r.wastedCost),
        window_fmt: fmtWindow(r.firstSeen, r.lastSeen),
      })),
    [q.repeated, money],
  );

  const wasteColumns = useMemo(
    () => [
      { header: t("query.user"), accessor: "actor" },
      { header: t("query.app"), accessor: "app" },
      { header: t("query.waste.each"), accessor: "each_fmt" },
      { header: t("query.waste.repeats"), accessor: "repeats_fmt" },
      { header: t("query.waste.wasted"), accessor: "wasted_gib_fmt" },
      { header: t("query.cost"), accessor: "wasted_cost_fmt" },
      { header: t("query.waste.window"), accessor: "window_fmt" },
    ],
    [t],
  );

  const avgAll = q.totalQueries > 0 ? q.totalGib / q.totalQueries : 0;
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
          {/* ── Headline numbers ────────────────────────────────────────────── */}
          <Flex gap={12} flexWrap="wrap">
            <KpiCard
              label={t("query.total")}
              value={q.isLoading ? "…" : money(q.totalCost)}
              isLoading={q.isLoading}
              error={q.error}
            />
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

          {/* ── Recoverable waste: byte-identical repeated queries ──────────── */}
          {!q.isLoading && q.repeated.length > 0 && (
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
                  <Heading level={3} style={{ margin: 0 }}>{money(q.wastedCost)}</Heading>
                  <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
                    {t("query.waste.kpi")} · {fmtGib(q.wastedGib)} · {fmtNum(wastePct)}%
                  </Text>
                </Flex>
              </Flex>
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, lineHeight: 1.55 }}>
                {t("query.waste.body")}
              </Text>
              <DataTable data={wasteRows} columns={wasteColumns} sortable resizable />
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
                {t("query.waste.fix")}
              </Text>
            </Surface>
          )}

          <Divider />

          {/* ── Who / where the spend comes from ────────────────────────────── */}
          <Flex flexDirection="column" gap={12}>
            <Flex justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={8}>
              <Heading level={3} style={{ margin: 0 }}>
                {axis === "user" ? t("query.byUser") : axis === "app" ? t("query.byApp") : t("query.byDashboard")}
              </Heading>
              <Flex gap={8}>
                <Button variant={axis === "dashboard" ? "emphasized" : "default"} onClick={() => setAxis("dashboard")}>
                  {t("query.byDashboard")}
                </Button>
                <Button variant={axis === "user" ? "emphasized" : "default"} onClick={() => setAxis("user")}>
                  {t("query.byUser")}
                </Button>
                <Button variant={axis === "app" ? "emphasized" : "default"} onClick={() => setAxis("app")}>
                  {t("query.byApp")}
                </Button>
              </Flex>
            </Flex>
            {axis === "dashboard" && (
              <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, maxWidth: 760 }}>
                {t("query.dash.note")}
              </Text>
            )}
            {q.isLoading
              ? <Text>Loading…</Text>
              : spenderRows.length === 0 && axis === "dashboard"
                ? <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>{t("query.dash.none")}</Text>
                : <DataTable data={spenderRows} columns={spenderColumns} sortable resizable />}
          </Flex>

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
