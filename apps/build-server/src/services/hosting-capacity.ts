import type {
  HostingResources,
  HostingTier
} from "@docker-image-builder-system/shared-contract";

import { defaultHostingResources } from "./hosting-policy.js";

// Local kind baseline validated on 2026-08-04:
// allocatable 4 CPU / ~7.7Gi, less system requests and 25% reserve.
export const DEFAULT_HOSTING_CAPACITY = {
  cpuMillicores: 2000,
  memoryMi: 5632
} as const;

export type HostingCapacity = {
  cpuMillicores: number;
  memoryMi: number;
};

export type HostingCapacityReservation = {
  buildId: string;
  appName: string;
  tier: HostingTier;
  cpuMillicores: number;
  memoryMi: number;
  replicas: number;
};

export function reservationForTier(
  buildId: string,
  appName: string,
  tier: HostingTier
): HostingCapacityReservation {
  return reservationForResources(buildId, appName, tier, defaultHostingResources(tier));
}

export function reservationForResources(
  buildId: string,
  appName: string,
  tier: HostingTier,
  resources: HostingResources
): HostingCapacityReservation {
  const cost = resourceCost(resources);
  return {
    buildId,
    appName,
    tier,
    ...cost,
    replicas: resources.replicas
  };
}

export function canReserveHostingCapacity(
  used: HostingCapacity,
  request: HostingCapacityReservation,
  capacity: HostingCapacity = DEFAULT_HOSTING_CAPACITY
): boolean {
  return (
    used.cpuMillicores + request.cpuMillicores <= capacity.cpuMillicores &&
    used.memoryMi + request.memoryMi <= capacity.memoryMi
  );
}

export type TierCapacity = {
  tier: HostingTier;
  cpuServices: number;
  memoryServices: number;
  maxServices: number;
  perService: {
    cpuMillicores: number;
    memoryMi: number;
    replicas: number;
  };
};

export function parseCpuQuantity(value: string): number {
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)(m)?$/);
  if (!match) throw new Error(`Invalid CPU quantity: ${value}`);
  return Math.round(Number(match[1]) * (match[2] ? 1 : 1000));
}

export function parseMemoryQuantity(value: string): number {
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)(Ki|Mi|Gi)$/);
  if (!match) throw new Error(`Invalid memory quantity: ${value}`);
  const numeric = Number(match[1]);
  return Math.ceil(match[2] === "Ki" ? numeric / 1024 : match[2] === "Gi" ? numeric * 1024 : numeric);
}

export function resourceCost(resources: HostingResources): {
  cpuMillicores: number;
  memoryMi: number;
} {
  return {
    cpuMillicores: parseCpuQuantity(resources.cpuRequest) * resources.replicas,
    memoryMi: parseMemoryQuantity(resources.memoryRequest) * resources.replicas
  };
}

export function calculateTierCapacity(
  tier: HostingTier,
  capacity: HostingCapacity = DEFAULT_HOSTING_CAPACITY
): TierCapacity {
  const resources = defaultHostingResources(tier);
  const cost = resourceCost(resources);
  const cpuServices = Math.floor(capacity.cpuMillicores / cost.cpuMillicores);
  const memoryServices = Math.floor(capacity.memoryMi / cost.memoryMi);
  return {
    tier,
    cpuServices,
    memoryServices,
    maxServices: Math.min(cpuServices, memoryServices),
    perService: {
      cpuMillicores: cost.cpuMillicores,
      memoryMi: cost.memoryMi,
      replicas: resources.replicas
    }
  };
}

export function calculateAllTierCapacity(
  capacity: HostingCapacity = DEFAULT_HOSTING_CAPACITY
): Record<HostingTier, TierCapacity> {
  return {
    sandbox: calculateTierCapacity("sandbox", capacity),
    standard: calculateTierCapacity("standard", capacity),
    production: calculateTierCapacity("production", capacity)
  };
}
