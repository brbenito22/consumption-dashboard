import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";

const APP_ID = "my.consumption.dashboard";
const SCHEMA_ID = "rate-card-settings";
const SETTINGS_APP = "dynatrace.classic.settings";
const DASHBOARDS_APP = "dynatrace.dashboards";

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
 * dashboard running the expensive query.
 *
 * The route MUST go through the Dashboards app segment
 * (`/ui/apps/dynatrace.dashboards/dashboard/<id>`). A bare
 * `/ui/dashboard/<id>` on the tenant origin is not a platform route and the
 * environment silently falls back to the launcher — which is exactly what
 * `client.source` looks like, but only because that URL is served from the
 * app's own per-session subdomain. Built from the SDK environment URL rather
 * than window.location for the same reason: this app has its own subdomain.
 */
export function dashboardUrl(dashboardId: string): string {
  return `${environmentBase()}/ui/apps/${DASHBOARDS_APP}/dashboard/${encodeURIComponent(dashboardId)}`;
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
