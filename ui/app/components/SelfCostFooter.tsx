import React from "react";
import { Surface, Flex, Grid } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useRateCard } from "../hooks/useRateCard";
import { useCurrency } from "../context/CurrencyContext";
import { useLang } from "../context/LanguageContext";
import { normalizeCapabilityName } from "../constants/rateCard";

// ── Cost Center app self-cost estimate constants ────────────────────────────
// Rough GiB scanned per full user session across all tabs the app renders.
// As of v1.61.0 every raw fetch logs/spans/events offender panel is gated
// behind an explicit click, so a default session's billable scan is just the
// bizevents trend (fetch bizevents, 7d cap — no usage-event type exists for
// bizevents). Loading the offender panels adds their 6h scans on top, by
// deliberate user choice, so they're priced out of the default estimate.
const APP_GIB_SCANNED_PER_SESSION = 2;
const APP_SESSIONS_PER_DAY = 1; // "daily user" scenario

/**
 * Billing-tab footer: the safeguard disclaimer (left) and an estimate of what
 * running Cost Center itself costs (right), priced from the Log Query rate.
 * The rate card entry's `price` is already normalized to "USD per single GiB
 * scanned", so the annual formula is a plain multiplication:
 *   annual = GiB_per_session × sessions_per_day × 365 × price_per_GiB
 */
export const SelfCostFooter: React.FC = () => {
  const rateCard = useRateCard();
  const { money } = useCurrency();
  const { t } = useLang();

  const logQueryRate = rateCard.ratesByName.get(normalizeCapabilityName("Log Management & Analytics - Query"));
  const perGibScanPrice = logQueryRate?.price ?? 0.0035;
  const singleUserAnnualCost = APP_GIB_SCANNED_PER_SESSION * APP_SESSIONS_PER_DAY * 365 * perGibScanPrice;
  const teamAnnualCost = singleUserAnnualCost * 10;

  return (
    <Grid gridTemplateColumns="repeat(auto-fit, minmax(340px, 1fr))" gap={16}>
      {/* Safeguard note — explains the ~1% vs Dynatrace Official Cost and the
          app's purpose. Kept short & explicit to cover us against being read
          as an authoritative invoice. */}
      <Surface
        elevation="flat"
        color="primary"
        style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}
      >
        <Heading level={5} style={{ margin: 0 }}>{t("billing.disclaimerTitle")}</Heading>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default, lineHeight: 1.55 }}>
          {t("billing.disclaimer")}
        </Text>
        {rateCard.officialCostDiag && (
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, fontSize: 10 }}>
            Subscription API: {rateCard.officialCostDiag}
          </Text>
        )}
      </Surface>

      {/* App self-cost — rough estimate of what running Cost Center itself
          costs (Grail query scan × Log Query rate). */}
      <Surface
        elevation="flat"
        color="primary"
        style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}
      >
        <Heading level={5} style={{ margin: 0 }}>{t("billing.appCostTitle")}</Heading>
        <Flex flexDirection="column" gap={6}>
          <Flex justifyContent="space-between" alignItems="baseline" gap={8}>
            <Text textStyle="base-emphasized" style={{ color: Colors.Text.Neutral.Default }}>
              {rateCard.isLoading ? "…" : money(singleUserAnnualCost)}
              <span style={{ color: Colors.Text.Neutral.Subdued, fontWeight: 400, marginLeft: 4 }}>
                {t("billing.appCostPerYear")}
              </span>
            </Text>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
              {t("billing.appCostSingle")}
            </Text>
          </Flex>
          <Flex justifyContent="space-between" alignItems="baseline" gap={8}>
            <Text textStyle="base-emphasized" style={{ color: Colors.Text.Neutral.Default }}>
              {rateCard.isLoading ? "…" : money(teamAnnualCost)}
              <span style={{ color: Colors.Text.Neutral.Subdued, fontWeight: 400, marginLeft: 4 }}>
                {t("billing.appCostPerYear")}
              </span>
            </Text>
            <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
              {t("billing.appCostTeam")}
            </Text>
          </Flex>
        </Flex>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued, fontSize: 11, lineHeight: 1.45 }}>
          {t("billing.appCostNote")}
        </Text>
        <Text
          textStyle="small"
          style={{
            color: rateCard.source === "account" ? Colors.Text.Success.Default : Colors.Text.Warning.Default,
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.45,
          }}
        >
          {rateCard.source === "account"
            ? t("billing.appCostSourceAccount")
            : t("billing.appCostSourceDefault")}
        </Text>
      </Surface>
    </Grid>
  );
};
