import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";

const APP_ID = "my.consumption.dashboard";
const SCHEMA_ID = "rate-card-settings";
const SETTINGS_APP = "dynatrace.classic.settings";

/**
 * Builds the deep link to this app's rate-card settings page in the
 * Classic Settings app, using the SDK-resolved environment URL:
 *   {tenantUrl}/ui/apps/dynatrace.classic.settings/ui/settings/app:{appId}:{schemaId}
 */
export function rateCardSettingsUrl(): string {
  let base = "";
  try {
    base = getEnvironmentUrl();
  } catch {
    base = typeof window !== "undefined" ? window.location.origin : "";
  }
  base = base.replace(/\/+$/, "");
  return `${base}/ui/apps/${SETTINGS_APP}/ui/settings/app:${APP_ID}:${SCHEMA_ID}`;
}
