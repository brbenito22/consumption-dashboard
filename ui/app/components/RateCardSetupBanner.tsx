import React from "react";
import { Surface, Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useRateCard } from "../hooks/useRateCard";

const ACCOUNT_MGMT_URL = "https://myaccount.dynatrace.com";

/**
 * "How to capture the account rate card" banner (Billing tab). Green when the
 * account rate card is active, amber walkthrough otherwise. Reads useRateCard
 * directly — the hook is module-cached, so this adds no extra API calls.
 */
export const RateCardSetupBanner: React.FC = () => {
  const rateCard = useRateCard();
  const isAccount = rateCard.source === "account";

  return (
    <Surface
      elevation="flat"
      color={isAccount ? "success" : "warning"}
      style={{
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        // Force the tint explicitly — Surface's `color` prop alone renders
        // a subtle tint that reads as neutral on this Strato build. Setting
        // the border + a light background makes the state unmistakable.
        background: isAccount
          ? Colors.Background.Field.Success.Default
          : Colors.Background.Field.Warning.Default,
        border: `1px solid ${isAccount ? Colors.Border.Success.Default : Colors.Border.Warning.Default}`,
      }}
    >
      <Flex justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={8}>
        <Heading level={5} style={{ margin: 0 }}>
          {isAccount
            ? "Using your account rate card ✓"
            : "Use your real contract prices (account rate card)"}
        </Heading>
        <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
          Currently: <strong>{isAccount ? "Account rate card" : "Default rate card"}</strong>
        </Text>
      </Flex>

      <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
        To price consumption with your contracted rate card, the app authenticates to the Dynatrace
        Account Management API using an OAuth client. Follow these steps:
      </Text>

      <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
        <li>
          <Text textStyle="small">
            Open <a href={ACCOUNT_MGMT_URL} target="_blank" rel="noreferrer" style={{ color: Colors.Text.Primary.Default }}>myaccount.dynatrace.com</a> →
            <strong> Identity &amp; access management → OAuth clients → Create client</strong>, and grant the
            permission <strong>Account UAC read</strong> (<code>account-uac-read</code>).
          </Text>
        </li>
        <li>
          <Text textStyle="small">
            Copy the <strong>Client ID</strong> (starts with <code>dt0s02.</code>) and the
            <strong> Client Secret</strong> (shown only once).
          </Text>
        </li>
        <li>
          <Text textStyle="small">
            Find your <strong>Account UUID</strong> in the myaccount URL (<code>account/&lt;UUID&gt;</code>) or under
            <strong> Account settings</strong>.
          </Text>
        </li>
        <li>
          <Text textStyle="small">
            Open <strong>Configure rate card</strong>, set <strong>Rate Card Source = Account Rate Card</strong>,
            paste Account ID / Client ID / Client Secret, and save.
          </Text>
        </li>
      </ol>
    </Surface>
  );
};
