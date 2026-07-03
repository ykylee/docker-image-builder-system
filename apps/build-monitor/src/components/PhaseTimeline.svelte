<script lang="ts">
  /**
   * PhaseTimeline — DESIGN.md §3 Components.
   *
   * TASK-050: BuildStatusResponse.phaseHistory + currentPhase 를 받아
   * canonical BuildPhase 리스트 (9 phases) 전체를 표시한다. 각 phase 는
   * "완료 / 현재 진행 / 미진행" 셋 중 하나의 상태로 시각화되고:
   *   - 완료: completedAt 타임스탬프 노출 (ISO 8601 → toLocaleString).
   *   - 현재: dot + "in-progress" 라벨, startedAt (= updatedAt) 노출.
   *   - 미진행: dot 만 흐리게.
   *
   * Skipped phase (건너뛴 phase) 는 "미진행" 으로 표시된다. phaseHistory
   * 가 transition 순서를 보장하므로 build 의 실제 진행을 정확히 반영한다.
   *
   * a11y: role="list" + 각 step role="listitem" + 상태별 aria-label.
   */
  // canonical 9 phases. shared-contract 와 동일한 순서/철자.
  const CANONICAL_PHASES = [
    "REQUEST_ACCEPTED",
    "QUEUE_CLAIMED",
    "SOURCE_PREPARED",
    "DOCKER_BUILD_STARTED",
    "DOCKER_BUILD_COMPLETED",
    "PREVIEW_QUEUED",
    "PREVIEW_READY",
    "COMPLETED",
    "FAILED"
  ] as const;

  type BuildPhase = (typeof CANONICAL_PHASES)[number];

  // prop type 은 넓게 string 으로 받는다. api.ts 의 BuildStatusResponse
  // 가 hand-typed 라 BuildPhase literal union 으로 좁히지 않았고, generated
  // type 도 동등. component 내부에서 CANONICAL_PHASES 와 비교해 매칭 여부
  // 결정.
  type PhaseHistoryEntry = {
    phase: string;
    completedAt: string; // ISO 8601
  };
  type CurrentPhaseEntry = {
    phase: string;
    startedAt: string; // ISO 8601
  };

  let {
    phaseHistory,
    currentPhase
  }: {
    phaseHistory: PhaseHistoryEntry[];
    currentPhase: CurrentPhaseEntry | null;
  } = $props();

  // phaseHistory 를 Map<phase, completedAt> 으로 정규화. canonical
  // 9 phases 중 어떤 게 완료됐는지 빠르게 조회.
  let completedMap = $derived(
    new Map(phaseHistory.map((entry) => [entry.phase, entry.completedAt]))
  );

  // 각 phase 의 시각화 상태 결정:
  //   - "completed": completedMap 에 있음
  //   - "current": currentPhase?.phase 와 일치
  //   - "pending": 둘 다 아님
  // 단, terminal (COMPLETED, FAILED) phase 가 completedMap 에 있으면
  // current 는 무조건 null. 그 외에는 마지막 transition 또는 current
  // phase 기준으로 "current" 결정.
  type Status = "completed" | "current" | "pending";
  function statusFor(phase: BuildPhase): Status {
    if (completedMap.has(phase)) {
      return "completed";
    }
    if (currentPhase && currentPhase.phase === phase) {
      return "current";
    }
    return "pending";
  }

  function completedAtFor(phase: BuildPhase): string | null {
    return completedMap.get(phase) ?? null;
  }

  function formatTimestamp(iso: string): string {
    // ISO 8601 → 사용자 locale. ssr-safe 가 아닌 부분 (Intl) 이지만
    // build-monitor 는 Svelte SPA 라 client-side render — OK.
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return date.toLocaleString();
  }
</script>

<ol class="timeline" role="list" aria-label="Build phase timeline">
  {#each CANONICAL_PHASES as phase (phase)}
    {@const status = statusFor(phase)}
    {@const completedAt = completedAtFor(phase)}
    <li
      class="step"
      class:completed={status === "completed"}
      class:current={status === "current"}
      class:pending={status === "pending"}
      role="listitem"
      data-phase={phase}
      aria-label={`${phase} — ${status}`}
    >
      <span class="dot" aria-hidden="true"></span>
      <div class="body">
        <div class="phase mono">{phase}</div>
        <div class="meta">
          {#if status === "completed" && completedAt}
            <span class="ts" title="Completed at">✓ {formatTimestamp(completedAt)}</span>
          {:else if status === "current" && currentPhase}
            <span class="ts current-ts" title="Updated at">● in-progress · {formatTimestamp(currentPhase.startedAt)}</span>
          {:else}
            <span class="ts muted">— pending</span>
          {/if}
        </div>
      </div>
    </li>
  {/each}
</ol>

<style>
  .timeline {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    position: relative;
  }
  .timeline::before {
    content: '';
    position: absolute;
    top: 8px;
    bottom: 8px;
    left: 4.5px;
    width: 2px;
    background: var(--color-border-subtle);
    z-index: 0;
  }
  .step {
    display: grid;
    grid-template-columns: 12px 1fr;
    align-items: start;
    gap: var(--space-lg);
    position: relative;
    z-index: 1;
  }
  .dot {
    width: 11px;
    height: 11px;
    border-radius: var(--radius-pill);
    background: var(--color-bg-canvas);
    box-shadow: 0 0 0 2px var(--color-border-subtle);
    margin-top: 6px;
    border: 2px solid var(--color-bg-surface);
  }
  .step.completed .dot {
    background: var(--color-accent-success);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent-success) 35%, transparent);
  }
  .step.current .dot {
    background: var(--color-accent-primary);
    box-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-primary) 45%, transparent);
    animation: pulse 1.6s ease-in-out infinite;
  }
  /* FAILED phase 는 completedMap 에 push 된 시점에 completed 의
     accent-danger 톤으로 렌더된다. 별도 selector 불필요. */
  .step.completed[data-phase="FAILED"] .dot {
    background: var(--color-accent-danger);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent-danger) 35%, transparent);
  }
  .step.completed[data-phase="FAILED"] .ts {
    color: var(--color-accent-danger);
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.25); }
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .phase {
    font-size: var(--size-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-text-primary);
  }
  .step.pending .phase {
    color: var(--color-text-muted);
  }
  .meta {
    font-size: var(--size-xs);
  }
  .ts {
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
  }
  .ts.muted {
    color: var(--color-text-muted);
  }
  .ts.current-ts {
    color: var(--color-accent-primary);
    font-weight: var(--weight-medium);
  }
  .step.completed .ts {
    color: var(--color-accent-success);
  }
</style>
