<script lang="ts">
  /**
   * StatusPill — DESIGN.md §3 Components.
   * color + text + uppercase mono 로 status 를 명확히 encode (color blindness 대비).
   * a11y: role="status" + aria-label="Build status: <STATUS>"
   */
  let { status }: { status: string } = $props();

  // status → CSS color token 매핑
  function colorFor(s: string): string {
    switch (s) {
      case "QUEUED": return "var(--color-text-secondary)";
      case "BUILDING": return "var(--color-accent-warning)";
      case "COMPLETED": return "var(--color-accent-success)";
      case "FAILED": return "var(--color-accent-danger)";
      case "PROVISIONING": return "var(--color-accent-info)";
      case "PREVIEW_QUEUED":
      case "PREVIEW_READY":
      case "TEST_READY":
        return "var(--color-accent-info)";
      case "EXPIRED": return "var(--color-text-muted)";
      default: return "var(--color-text-muted)";
    }
  }

  let color = $derived(colorFor(status));
  let label = $derived(status || "UNKNOWN");
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
    padding: 2px var(--space-sm);
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--pill-color) 18%, transparent);
    color: var(--pill-color);
    font-family: var(--font-mono);
    font-size: var(--size-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    line-height: var(--line-tight);
    white-space: nowrap;
  }
</style>
