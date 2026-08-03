import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useCurrency } from "../context/CurrencyContext";
import { fmtPct, fmtBytes, fmtGibH, num } from "../utils/format";
import { cellBase, headCell } from "./CostTable";

// ── Host inventory row ──────────────────────────────────────────────────────
export interface HostRow {
  id?: unknown;
  name?: unknown;
  monitoringMode?: unknown;
  osType?: unknown;
  osVersion?: unknown;
  cpuCores?: unknown;
  memoryTotal?: unknown;
  hostGroupName?: unknown;
  /**
   * Raw `dt.entity.host.cloudType`. Known values in real tenants:
   * `EC2`, `AZURE`, `GOOGLE_CLOUD_PLATFORM`, `KUBERNETES`, `OPENSHIFT`, `OTHER`.
   * `null` / missing → on-premises or non-cloud virtualization.
   */
  cloudType?: unknown;
}

export interface HostLicense { gibH: number; hostH: number; cost: number }

/** Human-readable cloud label + short badge for the inventory table. */
export function cloudProvider(cloudType: string | null | undefined): { label: string; short: string; isCloud: boolean } {
  const raw = (cloudType ?? "").toString().trim();
  if (!raw) return { label: "On-premises",     short: "on-prem", isCloud: false };
  switch (raw) {
    case "EC2":                    return { label: "AWS EC2",         short: "AWS",   isCloud: true };
    case "AZURE":                  return { label: "Azure VM",        short: "Azure", isCloud: true };
    case "GOOGLE_CLOUD_PLATFORM":  return { label: "GCP Compute Engine", short: "GCP",   isCloud: true };
    case "KUBERNETES":             return { label: "Kubernetes",      short: "K8s",   isCloud: false };
    case "OPENSHIFT":              return { label: "OpenShift",       short: "OCP",   isCloud: false };
    case "OTHER":                  return { label: "Other cloud",     short: "cloud", isCloud: true };
    default:                       return { label: raw,               short: raw,     isCloud: true };
  }
}

function cloudBadge(cloudType: string | null | undefined) {
  const { label, short, isCloud } = cloudProvider(cloudType);
  return (
    <span
      title={label}
      style={{
        fontSize: "11px",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 10,
        color:      isCloud ? Colors.Text.Primary.Default : Colors.Text.Neutral.Subdued,
        background: isCloud ? Colors.Background.Field.Primary.Emphasized : Colors.Background.Container.Neutral.Default,
      }}
    >
      {short}
    </span>
  );
}

function modePill(mode: string) {
  const fullStack = mode === "FULL_STACK";
  return (
    <span style={{
      fontSize: "11px",
      fontWeight: 600,
      padding: "2px 8px",
      borderRadius: 10,
      color: fullStack ? Colors.Text.Primary.Default : Colors.Text.Success.Default,
      background: fullStack ? Colors.Background.Field.Primary.Emphasized : Colors.Background.Field.Success.Default,
    }}>
      {mode}
    </span>
  );
}

interface HostInventoryTableProps {
  hosts: HostRow[];
  isLoading: boolean;
  error: string | null;
  cpuByName: Map<string, number>;
  memByName: Map<string, number>;
  licenseByHost: Map<string, HostLicense>;
  cloudTotal: number;
}

/**
 * Host inventory (Infrastructure tab): cloud/on-prem filter chips + the
 * per-host table with license consumption and estimated cost. The filter is
 * pure client-side — it reuses the already-fetched hosts, zero Grail cost.
 */
export const HostInventoryTable: React.FC<HostInventoryTableProps> = ({
  hosts, isLoading, error, cpuByName, memByName, licenseByHost, cloudTotal,
}) => {
  const { money } = useCurrency();
  const [cloudFilter, setCloudFilter] = useState<"all" | "cloud" | "onprem">("all");

  const hostsFiltered = useMemo(() => {
    if (cloudFilter === "all") return hosts;
    return hosts.filter((h) => {
      const c = cloudProvider(h.cloudType as string | undefined).isCloud;
      return cloudFilter === "cloud" ? c : !c;
    });
  }, [hosts, cloudFilter]);

  const filterLabel = (key: "all" | "cloud" | "onprem") =>
    key === "all" ? `All (${hosts.length})`
    : key === "cloud" ? `Cloud only (${cloudTotal})`
    : `On-prem only (${hosts.length - cloudTotal})`;

  if (error) return <Text style={{ color: "var(--dt-color-text-critical)" }}>Failed to load hosts: {error}</Text>;

  return (
    <>
      <Flex gap={6} alignItems="center">
        {(["all", "cloud", "onprem"] as const).map((key) => {
          const active = cloudFilter === key;
          return (
            <button
              key={key}
              onClick={() => setCloudFilter(key)}
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 6,
                cursor: "pointer",
                border: `1px solid ${active ? Colors.Border.Primary.Accent : Colors.Border.Neutral.Default}`,
                background: active ? Colors.Background.Field.Primary.Emphasized : "transparent",
                color:      active ? Colors.Text.Primary.Default : Colors.Text.Neutral.Default,
              }}
            >
              {filterLabel(key)}
            </button>
          );
        })}
      </Flex>
      {isLoading ? (
        <Text style={{ color: "var(--dt-color-text-subdued)" }}>Loading hosts…</Text>
      ) : hostsFiltered.length === 0 ? (
        <Text style={{ color: "var(--dt-color-text-subdued)" }}>{hosts.length === 0 ? "No hosts found." : "No hosts match the current filter."}</Text>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 6, border: `1px solid ${Colors.Border.Neutral.Default}` }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1180 }}>
            <thead>
              <tr>
                <th style={{ ...headCell, textAlign: "left" }}>Host</th>
                <th style={{ ...headCell, textAlign: "left" }}>Cloud</th>
                <th style={{ ...headCell, textAlign: "left" }}>OS</th>
                <th style={{ ...headCell, textAlign: "left" }}>Mode</th>
                <th style={{ ...headCell, textAlign: "right" }}>Cores</th>
                <th style={{ ...headCell, textAlign: "right" }}>Memory</th>
                <th style={{ ...headCell, textAlign: "left" }}>Host Group</th>
                <th style={{ ...headCell, textAlign: "right" }}>Avg CPU</th>
                <th style={{ ...headCell, textAlign: "right" }}>Avg Mem</th>
                <th style={{ ...headCell, textAlign: "right" }}>License (GiB·h)</th>
                <th style={{ ...headCell, textAlign: "right" }}>Est. License Cost</th>
              </tr>
            </thead>
            <tbody>
              {hostsFiltered.map((h, i) => {
                const name = String(h.name ?? "—");
                const lic = licenseByHost.get(String(h.id ?? ""));
                return (
                  <tr key={String(h.id ?? i)}>
                    <td style={{ ...cellBase, fontWeight: 600, color: Colors.Text.Neutral.Default }}>{name}</td>
                    <td style={cellBase}>{cloudBadge(h.cloudType as string | undefined)}</td>
                    <td style={{ ...cellBase, color: Colors.Text.Neutral.Subdued }}>
                      {String(h.osType ?? "—")}{h.osVersion ? ` · ${String(h.osVersion)}` : ""}
                    </td>
                    <td style={cellBase}>{modePill(String(h.monitoringMode ?? "—"))}</td>
                    <td style={{ ...cellBase, textAlign: "right" }}>{num(h.cpuCores) || "—"}</td>
                    <td style={{ ...cellBase, textAlign: "right" }}>{h.memoryTotal ? fmtBytes(num(h.memoryTotal)) : "—"}</td>
                    <td style={{ ...cellBase, color: Colors.Text.Neutral.Subdued }}>{String(h.hostGroupName ?? "—")}</td>
                    <td style={{ ...cellBase, textAlign: "right", fontWeight: 600 }}>{fmtPct(cpuByName.get(name))}</td>
                    <td style={{ ...cellBase, textAlign: "right" }}>{fmtPct(memByName.get(name))}</td>
                    <td style={{ ...cellBase, textAlign: "right" }}>{lic && lic.gibH > 0 ? fmtGibH(lic.gibH) : "—"}</td>
                    <td style={{ ...cellBase, textAlign: "right", fontWeight: 600, color: Colors.Text.Neutral.Default }}>{lic ? money(lic.cost) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};
