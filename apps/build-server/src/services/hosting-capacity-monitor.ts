import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { HostingCapacity } from "./hosting-capacity.js";
import { parseCpuQuantity, parseMemoryQuantity } from "./hosting-capacity.js";

const execFileAsync = promisify(execFile);

type NodeLike = {
  status?: {
    allocatable?: {
      cpu?: string;
      memory?: string;
    };
  };
};

export type CapacityDrift = {
  status: "ok" | "drift";
  cpuRatio: number;
  memoryRatio: number;
  reason?: string;
};

export function shouldSendDriftAlert(
  nowMs: number,
  lastSentAtMs: number,
  cooldownMs: number,
  lastReason: string | undefined,
  currentReason: string | undefined
): boolean {
  return (
    lastSentAtMs === 0 ||
    lastReason !== currentReason ||
    nowMs - lastSentAtMs >= cooldownMs
  );
}

export async function postHostingCapacityDriftAlert(
  url: string,
  drift: CapacityDrift,
  configured: HostingCapacity,
  observed: HostingCapacity
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "hosting_capacity_drift",
        severity: "warning",
        observedAt: new Date().toISOString(),
        configured,
        observed,
        drift
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`capacity alert webhook returned HTTP ${response.status}`);
  } finally {
    clearTimeout(timer);
  }
}

export function assessHostingCapacityDrift(
  configured: HostingCapacity,
  observed: HostingCapacity,
  threshold: number
): CapacityDrift {
  const cpuRatio = observed.cpuMillicores / configured.cpuMillicores;
  const memoryRatio = observed.memoryMi / configured.memoryMi;
  if (cpuRatio < 1 - threshold) {
    return {
      status: "drift",
      cpuRatio,
      memoryRatio,
      reason: "CPU capacity is below the configured threshold."
    };
  }
  if (memoryRatio < 1 - threshold) {
    return {
      status: "drift",
      cpuRatio,
      memoryRatio,
      reason: "Memory capacity is below the configured threshold."
    };
  }
  return { status: "ok", cpuRatio, memoryRatio };
}

export function capacityFromNodeList(nodes: NodeLike[], reserveRatio: number): HostingCapacity {
  const totals = nodes.reduce(
    (total, node) => {
      const allocatable = node.status?.allocatable;
      if (!allocatable?.cpu || !allocatable.memory) return total;
      return {
        cpuMillicores: total.cpuMillicores + parseCpuQuantity(allocatable.cpu),
        memoryMi: total.memoryMi + parseMemoryQuantity(allocatable.memory)
      };
    },
    { cpuMillicores: 0, memoryMi: 0 }
  );
  return {
    cpuMillicores: Math.floor(totals.cpuMillicores * (1 - reserveRatio)),
    memoryMi: Math.floor(totals.memoryMi * (1 - reserveRatio))
  };
}

export async function observeKubernetesCapacity(reserveRatio: number): Promise<HostingCapacity> {
  const { stdout } = await execFileAsync("kubectl", ["get", "nodes", "-o", "json"]);
  const document = JSON.parse(stdout) as { items?: NodeLike[] };
  return capacityFromNodeList(document.items ?? [], reserveRatio);
}

export function startHostingCapacityMonitor(options: {
  configured: HostingCapacity;
  reserveRatio: number;
  threshold: number;
  intervalMs: number;
  observe?: () => Promise<HostingCapacity>;
  onDrift: (drift: CapacityDrift, observed: HostingCapacity) => void;
  onError: (error: unknown) => void;
}): { stop(): void; check(): Promise<void> } {
  const observe = options.observe ?? (() => observeKubernetesCapacity(options.reserveRatio));
  const check = async (): Promise<void> => {
    try {
      const observed = await observe();
      const drift = assessHostingCapacityDrift(
        options.configured,
        observed,
        options.threshold
      );
      if (drift.status === "drift") options.onDrift(drift, observed);
    } catch (error) {
      options.onError(error);
    }
  };
  const timer = options.intervalMs > 0 ? setInterval(() => void check(), options.intervalMs) : undefined;
  timer?.unref();
  return { check, stop: () => { if (timer) clearInterval(timer); } };
}
