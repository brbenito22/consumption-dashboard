import { useEffect, useMemo, useState } from "react";
import { functions } from "@dynatrace-sdk/app-utils";
import {
  defaultRateCard,
  unitForCapability,
  normalizeCapabilityName,
  type RateCardFunctionResponse,
  type RateCardResponse,
  type RateCardType,
  buildOfficialByCap,
  type BillingUnit,
  type OfficialCost,
  type OfficialBudget,
  type OfficialCapabilityCost,
} from "../constants/rateCard";

const RATE_CARD_FUNCTION = "get-rate-card";

// Module-level promise cache: useRateCard is mounted by several components at
// once (currency sync, Billing, per-tab cost panels) and the function now fans
// out ~20 Subscription-API calls per invocation — without this, one tab view
// would trigger 60+ upstream requests. One invocation per app session.
let rateCardPromise: Promise<RateCardFunctionResponse> | null = null;
function loadRateCardOnce(): Promise<RateCardFunctionResponse> {
  if (!rateCardPromise) {
    rateCardPromise = functions
      .call(RATE_CARD_FUNCTION)
      .then((res) => res.json() as Promise<RateCardFunctionResponse>)
      .catch((err) => {
        rateCardPromise = null; // allow retry on next mount after a failure
        throw err;
      });
  }
  return rateCardPromise;
}

export interface CapabilityRate {
  key: string;
  name: string;
  /** USD per single unit. */
  price: number;
  unit: BillingUnit;
  quotedUnitOfMeasure: string;
}

export interface RateCardState {
  isLoading: boolean;
  error: string | null;
  source: RateCardType;
  currency: string;
  /** Capability name (lower-cased) → rate. */
  ratesByName: Map<string, CapabilityRate>;
  capabilities: CapabilityRate[];
  /** Authoritative total cost from the Subscription API, when available. */
  officialCost: OfficialCost | null;
  /** Diagnostic describing why the official cost is / isn't available. */
  officialCostDiag: string | null;
  /** Annual commitment (budget) — API-discovered or manually configured. */
  officialBudget: OfficialBudget | null;
  /** OFFICIAL per-capability costs (Subscription API) keyed by normalized name.
   *  Empty map when the API doesn't expose the breakdown — callers fall back
   *  to the Grail×rate-card estimation. */
  officialByCap: Map<string, OfficialCapabilityCost>;
}

function buildRates(card: RateCardResponse): CapabilityRate[] {
  return card.capabilities.map((c) => {
    let unit = unitForCapability(c.quotedUnitOfMeasure);
    // Robust overrides by capability name — account rate cards may word the
    // unit-of-measure differently, but Retain is always per gibibyte-day and
    // HTTP Monitor per request.
    const lname = c.name.toLowerCase();
    if (lname.includes("retain")) unit = "gib_days";
    else if (lname.includes("http monitor")) unit = "requests";
    else if (lname.includes("kubernetes platform")) unit = "pod_hours";
    // Automation Workflow bills per execution — each BILLING_USAGE_EVENT row IS
    // one execution (validated in-tenant: 1,937 rows/30d × contract price ≈ the
    // Account Management figure). Code Monitoring carries billed_container_hours.
    else if (lname.includes("automation workflow")) unit = "executions";
    else if (lname.includes("code monitoring")) unit = "container_hours";
    return {
      key: c.key,
      name: c.name,
      price: Number(c.price) || 0,
      unit,
      quotedUnitOfMeasure: c.quotedUnitOfMeasure,
    };
  });
}

/**
 * Loads the environment rate card via the `get-rate-card` app function.
 * Returns capability prices keyed by capability name for cost calculation.
 */
export function useRateCard(): RateCardState {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<RateCardType>("default");
  const [card, setCard] = useState<RateCardResponse>(defaultRateCard[0]);
  const [officialCost, setOfficialCost] = useState<OfficialCost | null>(null);
  const [officialCostDiag, setOfficialCostDiag] = useState<string | null>(null);
  const [officialBudget, setOfficialBudget] = useState<OfficialBudget | null>(null);
  const [officialCapCosts, setOfficialCapCosts] = useState<OfficialCapabilityCost[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const body = await loadRateCardOnce();
        if (cancelled) return;

        const first = body.data?.[0] ?? defaultRateCard[0];
        setCard(first);
        setSource(body.source ?? "default");
        setOfficialCost(body.officialCost ?? null);
        setOfficialCostDiag(body.officialCostDiag ?? null);
        setOfficialBudget(body.officialBudget ?? null);
        setOfficialCapCosts(body.officialCapabilityCosts ?? []);
        if (body.error) setError(body.error);
      } catch (err) {
        if (cancelled) return;
        // Fall back to default rate card; surface the error for visibility.
        setCard(defaultRateCard[0]);
        setSource("default");
        setError(err instanceof Error ? err.message : "Failed to load rate card");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo<RateCardState>(() => {
    const capabilities = buildRates(card);
    const ratesByName = new Map<string, CapabilityRate>();
    // Key by normalized name so account rate cards with slightly different
    // capability naming still match the environment's event.type values.
    for (const r of capabilities) ratesByName.set(normalizeCapabilityName(r.name), r);
    return {
      isLoading,
      error,
      source,
      currency: card.currencyCode || "USD",
      ratesByName,
      capabilities,
      officialCost,
      officialCostDiag,
      officialBudget,
      officialByCap: buildOfficialByCap(officialCapCosts),
    };
  }, [card, isLoading, error, source, officialCost, officialCostDiag, officialBudget, officialCapCosts]);
}
