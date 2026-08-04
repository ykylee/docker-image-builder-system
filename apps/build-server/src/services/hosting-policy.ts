import type {
  BuildRequest,
  HostingResources,
  HostingTier,
  ServiceSize
} from "@docker-image-builder-system/shared-contract";

export const HOSTING_POLICY_VERSION = "v1";

type TierRank = 1 | 2 | 3;
type TierProfile = {
  rank: TierRank;
  size: ServiceSize;
  minCpu: number;
  minMemory: number;
  defaultResources: HostingResources;
  maxResources: HostingResources;
};

const profiles: Record<HostingTier, TierProfile> = {
  sandbox: {
    rank: 1,
    size: "small",
    minCpu: 0,
    minMemory: 0,
    defaultResources: {
      cpuRequest: "100m",
      memoryRequest: "128Mi",
      cpuLimit: "500m",
      memoryLimit: "512Mi",
      replicas: 1
    },
    maxResources: {
      cpuRequest: "250m",
      memoryRequest: "256Mi",
      cpuLimit: "500m",
      memoryLimit: "512Mi",
      replicas: 1
    }
  },
  standard: {
    rank: 2,
    size: "medium",
    minCpu: 250,
    minMemory: 256,
    defaultResources: {
      cpuRequest: "250m",
      memoryRequest: "512Mi",
      cpuLimit: "1",
      memoryLimit: "1Gi",
      replicas: 1
    },
    maxResources: {
      cpuRequest: "1",
      memoryRequest: "1Gi",
      cpuLimit: "1",
      memoryLimit: "1Gi",
      replicas: 2
    }
  },
  production: {
    rank: 3,
    size: "large",
    minCpu: 1000,
    minMemory: 1024,
    defaultResources: {
      cpuRequest: "500m",
      memoryRequest: "1Gi",
      cpuLimit: "2",
      memoryLimit: "2Gi",
      replicas: 2
    },
    maxResources: {
      cpuRequest: "2",
      memoryRequest: "2Gi",
      cpuLimit: "2",
      memoryLimit: "2Gi",
      replicas: 4
    }
  }
};

export function defaultHostingResources(tier: HostingTier): HostingResources {
  return { ...profiles[tier].defaultResources };
}

const tierByRank: Record<TierRank, HostingTier> = {
  1: "sandbox",
  2: "standard",
  3: "production"
};
const rankBySize: Record<ServiceSize, TierRank> = {
  small: 1,
  medium: 2,
  large: 3
};

export type HostingPolicyResult = {
  effectiveTier: HostingTier;
  serviceSize: ServiceSize;
  hostingPolicyVersion: string;
  resources: HostingResources;
};

export type HostingPolicyError = {
  kind: "tier_upgrade_required" | "resource_limit_exceeded";
  message: string;
};

function parseCpu(value: string): number {
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)(m)?$/);
  if (!match) return Number.NaN;
  const numeric = Number(match[1]);
  return match[2] ? numeric : numeric * 1000;
}

function parseMemory(value: string): number {
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)(Ki|Mi|Gi)$/);
  if (!match) return Number.NaN;
  const numeric = Number(match[1]);
  return match[2] === "Ki" ? numeric / 1024 : match[2] === "Gi" ? numeric * 1024 : numeric;
}

function rankForResources(input: BuildRequest["resources"]): TierRank | HostingPolicyError {
  if (!input) return 1;
  const cpu = input.cpuRequest ? parseCpu(input.cpuRequest) : 0;
  const memory = input.memoryRequest ? parseMemory(input.memoryRequest) : 0;
  if (!Number.isFinite(cpu) || !Number.isFinite(memory)) {
    return { kind: "resource_limit_exceeded", message: "CPU must use Kubernetes quantity syntax and memory must use Ki, Mi, or Gi." };
  }
  if (input.replicas && input.replicas > 4) {
    return { kind: "resource_limit_exceeded", message: "Hosting replicas cannot exceed 4." };
  }
  if (cpu > 1000 || memory > 1024 || (input.replicas ?? 1) > 2) return 3;
  if (cpu > 250 || memory > 256 || (input.replicas ?? 1) > 1) return 2;
  return 1;
}

function exceeds(value: HostingResources, max: HostingResources): boolean {
  return (
    parseCpu(value.cpuRequest) > parseCpu(max.cpuRequest) ||
    parseMemory(value.memoryRequest) > parseMemory(max.memoryRequest) ||
    parseCpu(value.cpuLimit) > parseCpu(max.cpuLimit) ||
    parseMemory(value.memoryLimit) > parseMemory(max.memoryLimit) ||
    value.replicas > max.replicas
  );
}

export function resolveHostingPolicy(input: BuildRequest):
  | { ok: true; policy: HostingPolicyResult }
  | { ok: false; error: HostingPolicyError } {
  const resourceRank = rankForResources(input.resources);
  if (typeof resourceRank !== "number") return { ok: false, error: resourceRank };
  const requestedRank = input.requestedTier
    ? profiles[input.requestedTier].rank
    : 1;
  const sizeRank = input.serviceSize ? rankBySize[input.serviceSize] : 1;
  const minimumRank = Math.max(resourceRank, requestedRank, sizeRank) as TierRank;
  if (input.requestedTier && requestedRank < Math.max(resourceRank, sizeRank)) {
    return {
      ok: false,
      error: {
        kind: "tier_upgrade_required",
        message: `Requested tier ${input.requestedTier} is below the resources or service size requirement.`
      }
    };
  }

  const effectiveTier = tierByRank[minimumRank];
  const profile = profiles[effectiveTier];
  const resources: HostingResources = {
    ...profile.defaultResources,
    ...(input.resources ?? {})
  };
  if (effectiveTier === "production") resources.replicas = Math.max(resources.replicas, 2);
  if (exceeds(resources, profile.maxResources)) {
    return {
      ok: false,
      error: {
        kind: "resource_limit_exceeded",
        message: `Requested hosting resources exceed the ${effectiveTier} tier limit.`
      }
    };
  }

  return {
    ok: true,
    policy: {
      effectiveTier,
      serviceSize: input.serviceSize ?? profile.size,
      hostingPolicyVersion: HOSTING_POLICY_VERSION,
      resources
    }
  };
}
