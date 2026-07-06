<script lang="ts">
  /**
   * FilterChips — canonical toggle chip group for status filters.
   *
   * TASK-083 이전에는 AdminBuilds.svelte / AdminRunners.svelte 에
   * `.chips + .chip + .chip.active` CSS 가 중복되어 있었고, active 상태의
   * glow 도 raw rgba (`0 4px 12px rgba(99, 102, 241, 0.4)`) 였다. 본 TASK
   * 에서 디자인 토큰 single-source 화 + `--shadow-glow` 정렬.
   *
   * AdminTabs 와 의미적으로 정합 — pill radius / subtle surface 배경 /
   * active 시 primary 배경 + glow shadow. tab vs chip 의 차이는:
   *   - chip 은 aria-pressed 토글 (한 번에 하나 active, 데이터 필터)
   *   - tab 은 router target (헤더 위치, 헤더 자체의 navigation)
   * 둘 다 "현재 활성 segment" 의 시각 encoding 으로 일관된 톤을 유지해
   * 운영자가 BuildsList chip 과 AdminBuilds chip 을 번갈아 봐도 같은 의미로
   * 직관.
   *
   * @example
   *   <FilterChips
   *     options={["ALL", "BUILDING", "COMPLETED", "FAILED"]}
   *     selected={filter}
   *     onSelect={(v) => (filter = v as StatusFilter)}
   *     ariaLabel="Status filter"
   *   />
   */
  let {
    options,
    selected,
    onSelect,
    ariaLabel = "Filter options"
  }: {
    options: ReadonlyArray<string>;
    selected: string;
    onSelect: (value: string) => void;
    ariaLabel?: string;
  } = $props();
</script>

<div class="chips" role="group" aria-label={ariaLabel}>
  {#each options as o (o)}
    <button
      type="button"
      class="chip"
      class:active={selected === o}
      aria-pressed={selected === o}
      onclick={() => onSelect(o)}
    >{o}</button>
  {/each}
</div>

<style>
  .chips {
    display: inline-flex;
    gap: var(--space-sm);
    background: var(--color-bg-surface);
    padding: var(--space-xs);
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-border-subtle);
    box-shadow: var(--shadow-card);
  }
  .chip {
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-text-secondary);
    font-size: var(--size-sm);
    font-weight: var(--weight-medium);
    border: 1px solid transparent;
    transition: color var(--motion-duration-fast) var(--motion-easing-standard),
                background var(--motion-duration-fast) var(--motion-easing-standard);
  }
  .chip:hover { color: var(--color-text-primary); }
  .chip.active {
    background: var(--color-accent-primary);
    color: white;
    /* raw rgba(`99, 102, 241, 0.4`) 는 dark / light 모드 의 의미 차이를
       반영 못 함. 디자인 토큰 `--shadow-glow` 는 모드별 자동 follow —
       dark `0 0 20px rgba(99, 102, 241, 0.3)` / light
       `0 0 20px rgba(79, 70, 229, 0.15)`. (TASK-083 정합). */
    box-shadow: var(--shadow-glow);
  }
</style>
