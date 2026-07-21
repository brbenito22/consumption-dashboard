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
  return `${environmentBase()}/ui/apps/${SETTINGS_APP}/ui/settings/app:${APP_ID}:${SCHEMA_ID}`;
}

/**
 * Deep link to a dashboard by id — lets the Query Cost tab jump straight to the
 * dashboard that is running the expensive query. Built from the SDK environment
 * URL rather than window.location: the app runs on its own per-session
 * subdomain, so its own origin would not resolve the platform route.
 */
export function dashboardUrl(dashboardId: string): string {
  return `${environmentBase()}/ui/dashboard/${encodeURIComponent(dashboardId)}`;
}

function environmentBase(): string {
  let base = "";
  try {
    base = getEnvironmentUrl();
  } catch {
    base = typeof window !== "undefined" ? window.location.origin : "";
  }
  return base.replace(/\/+$/, "");
}
