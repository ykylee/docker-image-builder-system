import type {
  BuildPhase,
  BuildPhaseHistoryEntry,
  BuildSummary
} from "@docker-image-builder-system/shared-contract";

export function isTerminalBuildPhase(phase: string): boolean {
  return phase === "COMPLETED" || phase === "FAILED";
}

export function normalizePhaseHistory(
  value: unknown
): BuildPhaseHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.phase !== "string" ||
      typeof entry.completedAt !== "string"
    ) {
      return [];
    }

    return [
      {
        phase: entry.phase as BuildPhase,
        completedAt: entry.completedAt
      }
    ];
  });
}

export function advancePhaseHistory(
  history: BuildPhaseHistoryEntry[],
  fromPhase: BuildPhase,
  toPhase: BuildPhase,
  transitionAt: string
): BuildPhaseHistoryEntry[] {
  if (fromPhase === toPhase) {
    return history;
  }

  const next = [...history, { phase: fromPhase, completedAt: transitionAt }];

  if (isTerminalBuildPhase(toPhase)) {
    next.push({ phase: toPhase, completedAt: transitionAt });
  }

  return next;
}

export function toPhaseTimeline(
  summary: BuildSummary,
  rawHistory: unknown
): {
  phaseHistory: BuildPhaseHistoryEntry[];
  currentPhase: { phase: BuildPhase; startedAt: string } | null;
} {
  const phaseHistory = normalizePhaseHistory(rawHistory);

  return {
    phaseHistory,
    currentPhase: isTerminalBuildPhase(summary.phase)
      ? null
      : {
          phase: summary.phase,
          startedAt:
            phaseHistory.at(-1)?.completedAt ?? summary.createdAt
        }
  };
}
