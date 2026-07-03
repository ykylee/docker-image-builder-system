<script lang="ts">
  /**
   * StatusPill — DESIGN.md §3 Components.
   * color + text + uppercase mono 로 status 를 명확히 encode (color blindness 대비).
   * a11y: role="status" + aria-label="Build status: <STATUS>"
   *
   * TASK-060: lifecycleStatus 가 전달되면 (canonical 12-state union) 그 값을
   * 우선 사용하고, 없으면 legacy `status` 로 fallback 한다. BuildSummary 의
   * 두 status 가 동시 emit 되는 migration window 동안 UI 가 두 status 를 모두
   * 안정적으로 표시하도록 한다.
   */
  let { status, lifecycleStatus }: { status: string; lifecycleStatus?: string } = $props();

  // status → CSS color token 매핑. Canonical lifecycle statuses (TASK-052)
  // 와 legacy preview-era statuses 가 공존하는 migration window 에서는
  // canonical 이름을 우선 매핑하고, legacy 이름은 동일 색상으로 fallback.
  function colorFor(s: string): string {
    switch (s) {
      // Canonical lifecycle (TASK-052)
      case "RECEIVED":
      case "QUEUED":
        return "var(--color-text-secondary)";
      case "PREPARING_SOURCE":
      case "BUILDING":
        return "var(--color-accent-warning)";
      case "BUILD_SUCCESS":
      case "TEST_SUCCESS":
      case "DEPLOY_SUCCESS":
      case "COMPLETED":
        return "var(--color-accent-success)";
      case "TESTING":
      case "DEPLOYING":
        return "var(--color-accent-info)";
      case "FAILED":
        return "var(--color-accent-danger)";
      case "CANCELLED":
        return "var(--color-text-secondary)";
      // Legacy preview-era (migration shim)
      case "CLAIMED":
        return "var(--color-accent-info)";
      case "TEST_READY":
        return "var(--color-accent-info)";
      // preview-era previewStatuses (BuildSummary.previewStatus field)
      case "PROVISIONING":
      case "PREVIEW_QUEUED":
      case "PREVIEW_READY":
        return "var(--color-accent-info)";
      case "EXPIRED":
        return "var(--color-text-secondary)";
      // UNKNOWN 도 secondary — light 모드 에서 --color-text-muted 가
      // 15% alpha-mix 시 canvas 에 거의 안 보임. (TASK-046 QA)
      default:
        return "var(--color-text-secondary)";
    }
  }

  // lifecycleStatus 가 전달되면 (canonical) 우선, 아니면 legacy `status` 로
  // fallback. canonical label 이면 노출된 status 문자열이 의미적으로 더
  // 분명해진다 (e.g. "DEPLOYING" > "BUILDING" for in-flight deploy).
  let effectiveStatus = $derived(lifecycleStatus ?? status);
  let color = $derived(colorFor(effectiveStatus));
  let label = $derived(effectiveStatus || "UNKNOWN");
</script>

<span
  class="pill"
  role="status"
  aria-label="Build status: {label}"
  style="--pill-color: {color}"
>{label}</span>

<style>
  .pill {
    display: inline-block;
    padding: 4px var(--space-md);
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--pill-color) 15%, transparent);
    color: var(--pill-color);
    border: 1px solid color-mix(in srgb, var(--pill-color) 30%, transparent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--pill-color) 15%, transparent);
    font-family: var(--font-mono);
    font-size: var(--size-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    line-height: var(--line-tight);
    white-space: nowrap;
  }
</style>
