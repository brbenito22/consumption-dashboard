import { appSettingsObjectsClient } from "@dynatrace-sdk/client-app-settings-v2";
import { defaultRateCard } from "../ui/app/constants/rateCard";
import type {
  RateCardFunctionResponse,
  RateCardResponse,
  OfficialCost,
  OfficialBudget,
  OfficialCapabilityCost,
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
  /** Manual annual commitment override (used when the API doesn't expose it). */
  annual_commitment?: number;
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
/**
 * Extracts the annual commitment (budget) + subscription period from a
 * subscription record, tolerating field-name differences across API versions.
 * The record may nest the budget (e.g. under `budget` or `currentPeriod`), so
 * one level of nested objects is scanned too.
 */
function extractBudget(sub: Record<string, unknown> | undefined): OfficialBudget | undefined {
  if (!sub) return undefined;
  const commitmentKeys = [
    "annualCommitment", "totalCommitment", "commitment", "budget", "totalBudget",
    "commitmentAmount", "budgetAmount",
  ];
  const startKeys = ["startTime", "startDate", "periodStart", "start", "validFrom"];
  const endKeys   = ["endTime", "endDate", "periodEnd", "end", "validTo", "expiresAt"];

  const scan = (rec: Record<string, unknown>): number | undefined => pickNumber(rec, commitmentKeys);
  const pickDate = (rec: Record<string, unknown>, keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = rec[k];
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    }
    return undefined;
  };

  let commitment = scan(sub);
  let periodStart = pickDate(sub, startKeys);
  let periodEnd = pickDate(sub, endKeys);
  if (commitment === undefined || !periodStart) {
    for (const v of Object.values(sub)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const rec = v as Record<string, unknown>;
        commitment  = commitment  ?? scan(rec);
        periodStart = periodStart ?? pickDate(rec, startKeys);
        periodEnd   = periodEnd   ?? pickDate(rec, endKeys);
      }
    }
  }
  if (commitment === undefined || commitment <= 0) return undefined;
  return { commitment, periodStart, periodEnd, source: "api" };
}

/**
 * Per-capability OFFICIAL costs from the raw cost rows — the same data that
 * populates Account Management's capability table. Detects the capability
 * name field defensively; when rows are time-sliced (≥5 rows per capability)
 * it also derives trailing-30d and previous-30d totals for AM-style deltas.
 * Returns [] when rows carry no capability dimension (UI then falls back to
 * the Grail×rate-card estimation — no regression).
 */
function extractCapabilityCosts(rows: Array<Record<string, unknown>>): OfficialCapabilityCost[] {
  const nameKeys = ["capabilityKey", "capabilityName", "capability", "name", "displayName", "key", "product"];
  const valueKeys = ["value", "cost", "totalCost", "amount", "total"];
  const timeKeys = ["endTime", "endDate", "end", "startTime", "startDate", "start", "date", "day"];

  const nameKey = nameKeys.find((k) => rows.some((r) => typeof r[k] === "string" && (r[k] as string).length > 0));
  if (!nameKey) return [];

  const now = Date.now();
  const d30 = now - 30 * 86_400_000;
  const d60 = now - 60 * 86_400_000;
  const agg = new Map<string, { periodTotal: number; last30: number; prev30: number; rows: number; timed: number }>();

  for (const r of rows) {
    const name = r[nameKey];
    if (typeof name !== "string" || !name) continue;
    const v = pickNumber(r, valueKeys);
    if (v === undefined) continue;
    let ts = NaN;
    for (const k of timeKeys) {
      if (typeof r[k] === "string" && r[k]) { ts = Date.parse(r[k] as string); break; }
    }
    const a = agg.get(name) ?? { periodTotal: 0, last30: 0, prev30: 0, rows: 0, timed: 0 };
    a.periodTotal += v;
    a.rows++;
    if (isFinite(ts)) {
      a.timed++;
      if (ts >= d30) a.last30 += v;
      else if (ts >= d60) a.prev30 += v;
    }
    agg.set(name, a);
  }

  return [...agg.entries()]
    .map(([name, a]) => ({
      name,
      periodTotal: a.periodTotal,
      // Time-derived windows only when the capability is genuinely time-sliced;
      // a single period-total row would masquerade as "last 30d" otherwise.
      last30: a.rows >= 5 && a.timed === a.rows ? a.last30 : null,
      prev30: a.rows >= 5 && a.timed === a.rows ? a.prev30 : null,
    }))
    .sort((x, y) => y.periodTotal - x.periodTotal);
}

/**
 * OFFICIAL per-capability costs via the documented `capabilityKeys` filter of
 * GET /cost — the response is time-bucketed (daily rows: startTime/endTime/
 * value) but carries NO capability field, so one request per capability is the
 * only way to attribute it. Requests run in chunks of 6 to stay polite with
 * the Account Management API; a failed key simply yields no row (fallback to
 * the Grail estimation for that capability — no regression).
 */
async function fetchPerCapabilityCosts(
  apiBase: string,
  accountId: string,
  subId: string,
  token: string,
  capabilities: Array<{ key: string; name: string }>,
): Promise<OfficialCapabilityCost[]> {
  const valueKeys = ["value", "cost", "totalCost", "amount", "total"];
  const now = Date.now();
  const d30 = now - 30 * 86_400_000;
  const d60 = now - 60 * 86_400_000;
  const out: OfficialCapabilityCost[] = [];

  const fetchOne = async (c: { key: string; name: string }): Promise<OfficialCapabilityCost | undefined> => {
    try {
      const res = await getJson(
        `${apiBase}/sub/v2/accounts/${accountId}/subscriptions/${subId}/cost?capabilityKeys=${encodeURIComponent(c.key)}`,
        token,
      );
      const rows = findRows(res) as Array<Record<string, unknown>>;
      let periodTotal = 0, last30 = 0, prev30 = 0, timed = 0, counted = 0;
      for (const r of rows) {
        const v = pickNumber(r, valueKeys);
        if (v === undefined) continue;
        counted++;
        periodTotal += v;
        const tsRaw = (r.endTime ?? r.startTime) as string | undefined;
        const ts = typeof tsRaw === "string" ? Date.parse(tsRaw) : NaN;
        if (isFinite(ts)) {
          timed++;
          if (ts >= d30) last30 += v;
          else if (ts >= d60) prev30 += v;
        }
      }
      if (counted === 0 || periodTotal === 0) return undefined;
      const sliced = counted >= 5 && timed === counted;
      return { name: c.name, periodTotal, last30: sliced ? last30 : null, prev30: sliced ? prev30 : null };
    } catch {
      return undefined;
    }
  };

  for (let i = 0; i < capabilities.length; i += 6) {
    const chunk = capabilities.slice(i, i + 6);
    const results = await Promise.all(chunk.map(fetchOne));
    for (const r of results) if (r) out.push(r);
  }
  return out.sort((a, b) => b.periodTotal - a.periodTotal);
}

async function fetchOfficialCost(
  apiBase: string,
  accountId: string,
  token: string,
  subscriptionId: string | undefined,
): Promise<{ cost?: OfficialCost; budget?: OfficialBudget; capabilityCosts?: OfficialCapabilityCost[]; diag: string }> {
  let budget: OfficialBudget | undefined;
  try {
    let subId = subscriptionId;
    // Always list subscriptions: even with a configured id we want the record
    // itself, which carries the annual commitment + subscription period.
    {
      const subs = await getJson(`${apiBase}/sub/v2/accounts/${accountId}/subscriptions`, token);
      const list = findRows(subs) as Array<Record<string, unknown>>;
      const chosen = subId
        ? list.find((r) => [r.subscriptionUuid, r.uuid, r.id].includes(subId)) ?? list[0]
        : list[0];
      budget = extractBudget(chosen);
      subId = subId ?? ((chosen?.subscriptionUuid ?? chosen?.uuid ?? chosen?.id) as string | undefined);
      if (!subId) {
        const keys = subs && typeof subs === "object" ? Object.keys(subs as object).join(",") : typeof subs;
        return { budget, diag: `no subscription found (subscriptions response: ${list.length} rows; top-level: ${keys})` };
      }
    }

    const cost = await getJson(`${apiBase}/sub/v2/accounts/${accountId}/subscriptions/${subId}/cost`, token);
    const rows = findRows(cost) as Array<Record<string, unknown>>;
    if (rows.length === 0) {
      const keys = cost && typeof cost === "object" ? Object.keys(cost as object).join(",") : typeof cost;
      return { budget, diag: `cost endpoint returned no rows (top-level keys: ${keys})` };
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
      return { budget, diag: `cost rows had no numeric value field (row keys: ${Object.keys(rows[0]).join(",")})` };
    }
    const currency =
      (rows.find((r) => r.currencyCode || r.currency)?.currencyCode as string | undefined) ??
      (rows.find((r) => r.currency)?.currency as string | undefined) ??
      "USD";
    starts.sort();
    ends.sort();
    const periodFrom = starts[0]?.slice(0, 10);
    const periodTo = (ends[ends.length - 1] ?? starts[starts.length - 1])?.slice(0, 10);
    const capabilityCosts = extractCapabilityCosts(rows);
    return {
      cost: { total, currency, subscriptionId: subId, periodFrom, periodTo },
      budget,
      capabilityCosts,
      diag: periodFrom
        ? `ok (${matched}/${rows.length} rows, ${periodFrom} → ${periodTo}, ${capabilityCosts.length} capabilities)`
        : `ok (${matched}/${rows.length} rows, no period, ${capabilityCosts.length} capabilities)`,
    };
  } catch (e) {
    return { budget, diag: e instanceof Error ? e.message : "unknown error" };
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
    const { cost: officialCost, budget, capabilityCosts, diag } = await fetchOfficialCost(
      apiBase, account_id, token, settings.subscription_id,
    );

    // The aggregate /cost rows carry no capability dimension (per API docs), so
    // when the inline extraction finds none, fan out per-capability using the
    // documented `capabilityKeys` filter with the rate card's own keys.
    let finalCapCosts = capabilityCosts ?? [];
    if (finalCapCosts.length === 0 && officialCost?.subscriptionId && accountRateCard?.length) {
      const keys = (accountRateCard[0]?.capabilities ?? [])
        .filter((c) => c.key && c.name)
        .map((c) => ({ key: String(c.key), name: String(c.name) }));
      if (keys.length > 0) {
        finalCapCosts = await fetchPerCapabilityCosts(apiBase, account_id, officialCost.subscriptionId, token, keys);
      }
    }
    const officialCostDiag = `${diag}; per-capability: ${finalCapCosts.length}`;

    // Manual commitment override wins when the API doesn't expose the budget.
    const manual = Number(settings.annual_commitment);
    const officialBudget =
      budget ??
      (isFinite(manual) && manual > 0
        ? ({ commitment: manual, source: "settings" } as OfficialBudget)
        : undefined);

    if (!accountRateCard || accountRateCard.length === 0) {
      return { data: defaultRateCard, source: "default", officialCost, officialCostDiag, officialBudget, officialCapabilityCosts: finalCapCosts };
    }
    return { data: accountRateCard, source: "account", officialCost, officialCostDiag, officialBudget, officialCapabilityCosts: finalCapCosts };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { data: defaultRateCard, source: "default", error: message };
  }
}
