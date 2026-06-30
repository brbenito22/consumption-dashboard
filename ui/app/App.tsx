import React, { useState } from "react";
import { Page, AppHeader } from "@dynatrace/strato-components-preview/layouts";
import {
  GridIcon,
  ContainerIcon,
  AnalyticsIcon,
  AppsIcon,
  HostsIcon,
  ListIcon,
  LineChartIcon,
} from "@dynatrace/strato-icons";
import { Overview }        from "./pages/Overview";
import { Infrastructure }  from "./pages/Infrastructure";
import { Observability }   from "./pages/Observability";
import { Applications }    from "./pages/Applications";
import { Cloud }           from "./pages/Cloud";
import { BillingOverview } from "./pages/BillingOverview";
import { Predictions }     from "./pages/Predictions";
import { SidebarNav, type SidebarNavEntry } from "./components/SidebarNav";
import { CurrencyProvider, useCurrency } from "./context/CurrencyContext";
import { LanguageProvider } from "./context/LanguageContext";
import { useRateCard } from "./hooks/useRateCard";
import { TimeframeSelector } from "./components/TimeframeSelector";
import { LanguageToggle } from "./components/LanguageToggle";
import { TIME_RANGE_OPTIONS, type TimeRangeOption } from "./types";

/**
 * Drives the display currency from the account's real billing currency.
 * Prefers the authoritative Subscription-API cost currency, then the rate
 * card currency, so a BRL account shows BRL automatically.
 */
const CurrencySync: React.FC = () => {
  const rateCard = useRateCard();
  const { currency, setCurrency } = useCurrency();
  React.useEffect(() => {
    if (rateCard.isLoading) return;
    const detected = rateCard.officialCost?.currency || rateCard.currency;
    if (detected && detected !== currency) setCurrency(detected);
  }, [rateCard.isLoading, rateCard.officialCost, rateCard.currency, currency, setCurrency]);
  return null;
};

const ICON_SIZE = 18;

interface NavEntry extends SidebarNavEntry {
  render: (tr: TimeRangeOption) => React.ReactNode;
}

const NAV: NavEntry[] = [
  { key: "overview",       label: "Overview",             icon: <GridIcon size={ICON_SIZE} />,      render: (tr) => <Overview       timeRange={tr} /> },
  { key: "infrastructure", label: "Infrastructure & K8s", icon: <ContainerIcon size={ICON_SIZE} />, render: (tr) => <Infrastructure timeRange={tr} /> },
  { key: "observability",  label: "Observability",        icon: <AnalyticsIcon size={ICON_SIZE} />, render: (tr) => <Observability  timeRange={tr} /> },
  { key: "applications",   label: "Applications",         icon: <AppsIcon size={ICON_SIZE} />,      render: (tr) => <Applications   timeRange={tr} /> },
  { key: "cloud",          label: "Cloud",                icon: <HostsIcon size={ICON_SIZE} />,     render: (tr) => <Cloud          timeRange={tr} /> },
  { key: "billing",        label: "Billing",              icon: <ListIcon size={ICON_SIZE} />,      render: (tr) => <BillingOverview timeRange={tr} /> },
  { key: "predictions",    label: "Predictions",          icon: <LineChartIcon size={ICON_SIZE} />, render: () => <Predictions /> },
];

export const App: React.FC = () => {
  const [activeKey, setActiveKey] = useState<string>("overview");
  const [timeRange, setTimeRange] = useState<TimeRangeOption>(TIME_RANGE_OPTIONS[3]); // default 7d
  const active = NAV.find((n) => n.key === activeKey) ?? NAV[0];

  return (
    <LanguageProvider>
    <CurrencyProvider>
    <CurrencySync />
    <Page>
      {/* ── App Header ── */}
      <Page.Header>
        <AppHeader>
          <AppHeader.NavItems>
            <AppHeader.AppNavLink href="/" />
          </AppHeader.NavItems>
        </AppHeader>
      </Page.Header>

      {/* ── Sidebar navigation ── */}
      <Page.Sidebar resizable={false}>
        <SidebarNav
          title="Cost Center"
          entries={NAV}
          activeKey={activeKey}
          onSelect={setActiveKey}
        />
      </Page.Sidebar>

      {/* ── Main content ── */}
      <Page.Main>
        {/* Global controls — timeframe (left) + language (right), every tab */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "16px 24px 0" }}>
          {activeKey !== "predictions"
            ? <TimeframeSelector value={timeRange} onChange={setTimeRange} />
            : <span />}
          <LanguageToggle />
        </div>
        {active.render(timeRange)}
      </Page.Main>
    </Page>
    </CurrencyProvider>
    </LanguageProvider>
  );
};
