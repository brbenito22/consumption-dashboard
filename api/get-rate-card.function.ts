import { appSettingsObjectsClient } from "@dynatrace-sdk/client-app-settings-v2";
import { defaultRateCard } from "../ui/app/constants/rateCard";
import type {
  RateCardFunctionResponse,
  RateCardResponse,
  OfficialCost,
} from "../ui/app/constants/rateCard";

const SCHEMA_ID = "rate-card-settings";

interface RateCardSettings {
  rate_card_type?: "account" | "default";
  account_id?: string;
  client_id?: string;
  client_secret?: string;
  sso_url?: string;
  account_api_base?: string;
  subscription_id?: string;
}

/** OAuth2 client-credentials flow against the Dynatrace SSO. */
async function authenticate(
  ssoUrl: string,
  clientId: string,
  clientSecret: string,
  accountId: string,
): Promise<string> {
  const body = new URLSearchParams();
  body.append("grant_type", "client_credentials");
  body.append("client_id", clientId);
  body.append("client_secret", clientSecret);
  body.append("scope", "account-uac-read");
  body.append("resource", `urn:dtaccount:${accountId}`);

  const res = await fetch(ssoUrl, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`SSO authentication failed: ${await res.text()}`);

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("SSO response did not contain an access_token");
  return json.access_token;
}

async function getJson(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Account rate card (price list) from the Account Management API. */
async function fetchAccountRateCard(
  apiBase: string,
  accountId: string,
  token: string,
): Promise<RateCardResponse[]> {
  return (await getJson(`${apiBase}/sub/v1/accounts/${accountId}/rate-cards`, token)) as RateCardResponse[];
}

/** Recursively pulls the first numeric `value`/`cost`/`amount` from a record. */
function pickNumber(obj: unknown, keys: string[]): number | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    if (typeof rec[k] === "number") return rec[k] as number;
    if (typeof rec[k] === "string" && rec[k] !== "" && isFinite(Number(rec[k]))) return Number(rec[k]);
  }
  return undefined;
}

/** Finds the first array of cost rows inside an unknown response shape. */
function findRows(obj: unknown): unknown[] {
  if (Array.isArray(obj)) return obj;
  if (obj && typeof obj === "object") {
    const rec = obj as Record<string, unknown>;
    for (const k of ["data", "costs", "items", "records", "result", "values"]) {
      if (Array.isArray(rec[k])) return rec[k] as unknown[];
    }
  }
  return [];
}

/**
 * Authoritative cost from the Platform Subscription API (v2).
 * Auto-discovers the subscription when one isn't configured, then sums the
 * subscription cost (Dynatrace's own computed cost). Tolerant of response-shape
 * differences; returns a diagnostic string explaining the outcome so the UI can
 * surface why the official cost is or isn't available (never exposes secrets).
 */
async function fetchOfficialCost(
  apiBase: string,
  accountId: string,
  token: string,
  subscriptionId: string | undefined,
): Promise<{ cost?: OfficialCost; diag: string }> {
  try {
    let subId = subscriptionId;
    if (!subId) {
      const subs = await getJson(`${apiBase}/sub/v2/accounts/${accountId}/subscriptions`, token);
      const list = findRows(subs) as Array<Record<string, unknown>>;
      subId = (list[0]?.subscriptionUuid ?? list[0]?.uuid ?? list[0]?.id) as string | undefined;
      if (!subId) {
        const keys = subs && typeof subs === "object" ? Object.keys(subs as object).join(",") : typeof subs;
        return { diag: `no subscription found (subscriptions response: ${list.length} rows; top-level: ${keys})` };
      }
    }

    const cost = await getJson(`${apiBase}/sub/v2/accounts/${accountId}/subscriptions/${subId}/cost`, token);
    const rows = findRows(cost) as Array<Record<string, unknown>>;
    if (rows.length === 0) {
      const keys = cost && typeof cost === "object" ? Object.keys(cost as object).join(",") : typeof cost;
      return { diag: `cost endpoint returned no rows (top-level keys: ${keys})` };
    }

    const valueKeys = ["value", "cost", "totalCost", "amount", "total"];
    // Cost rows carry the billing window as startTime/endTime (per Cost API v2).
    const startKeys = ["startTime", "startDate", "start", "from", "periodStart", "date", "day", "billingDate"];
    const endKeys = ["endTime", "endDate", "end", "to", "periodEnd"];
    let total = 0;
    let matched = 0;
    const starts: string[] = [];
    const ends: string[] = [];
    for (const r of rows) {
      const v = pickNumber(r, valueKeys);
      if (v !== undefined) { total += v; matched++; }
      for (const k of startKeys) { if (typeof r[k] === "string" && r[k]) { starts.push(r[k] as string); break; } }
      for (const k of endKeys) { if (typeof r[k] === "string" && r[k]) { ends.push(r[k] as string); break; } }
    }
    if (matched === 0) {
      return { diag: `cost rows had no numeric value field (row keys: ${Object.keys(rows[0]).join(",")})` };
    }
    const currency =
      (rows.find((r) => r.currencyCode || r.currency)?.currencyCode as string | undefined) ??
      (rows.find((r) => r.currency)?.currency as string | undefined) ??
      "USD";
    starts.sort();
    ends.sort();
    const periodFrom = starts[0]?.slice(0, 10);
    const periodTo = (ends[ends.length - 1] ?? starts[starts.length - 1])?.slice(0, 10);
    return {
      cost: { total, currency, subscriptionId: subId, periodFrom, periodTo },
      diag: periodFrom
        ? `ok (${matched}/${rows.length} rows, ${periodFrom} → ${periodTo})`
        : `ok (${matched}/${rows.length} rows, no period)`,
    };
  } catch (e) {
    return { diag: e instanceof Error ? e.message : "unknown error" };
  }
}

/**
 * App function: returns the environment rate card plus, when available, the
 * authoritative total cost from the Platform Subscription API.
 * Falls back to the Dynatrace default rate card for trial/sprint tenants or
 * when "account" mode isn't configured.
 */
export default async function (): Promise<RateCardFunctionResponse> {
  try {
    const stored = await appSettingsObjectsClient.getEffectiveAppSettingsValues({ schemaId: SCHEMA_ID });
    const settings = stored.items?.[0]?.value as RateCardSettings | undefined;

    if (!settings || settings.rate_card_type !== "account") {
      return { data: defaultRateCard, source: "default" };
    }

    const { account_id, client_id, client_secret } = settings;
    if (!account_id) throw new Error("Account ID is missing.");
    if (!client_id) throw new Error("OAuth Client ID is missing.");
    if (!client_secret) throw new Error("OAuth Client Secret is missing.");

    const ssoUrl = settings.sso_url || "https://sso.dynatrace.com/sso/oauth2/token";
    const apiBase = settings.account_api_base || "https://api.dynatrace.com";

    const token = await authenticate(ssoUrl, client_id, client_secret, account_id);

    const accountRateCard = await fetchAccountRateCard(apiBase, account_id, token);
    const { cost: officialCost, diag: officialCostDiag } = await fetchOfficialCost(
      apiBase, account_id, token, settings.subscription_id,
    );

    if (!accountRateCard || accountRateCard.length === 0) {
      return { data: defaultRateCard, source: "default", officialCost, officialCostDiag };
    }
    return { data: accountRateCard, source: "account", officialCost, officialCostDiag };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { data: defaultRateCard, source: "default", error: message };
  }
}
