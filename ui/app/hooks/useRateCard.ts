import { useEffect, useMemo, useState } from "react";
import { functions } from "@dynatrace-sdk/app-utils";
import {
  defaultRateCard,
  unitForCapability,
  normalizeCapabilityName,
  type RateCardFunctionResponse,
  type RateCardResponse,
  type RateCardType,
  type BillingUnit,
  type OfficialCost,
} from "../constants/rateCard";

const RATE_CARD_FUNCTION = "get-rate-card";

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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await functions.call(RATE_CARD_FUNCTION);
        const body = (await res.json()) as RateCardFunctionResponse;
        if (cancelled) return;

        const first = body.data?.[0] ?? defaultRateCard[0];
        setCard(first);
        setSource(body.source ?? "default");
        setOfficialCost(body.officialCost ?? null);
        setOfficialCostDiag(body.officialCostDiag ?? null);
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
    };
  }, [card, isLoading, error, source, officialCost, officialCostDiag]);
}
