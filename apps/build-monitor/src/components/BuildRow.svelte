<script lang="ts">
  import StatusPill from "./StatusPill.svelte";
  import { link } from "svelte-spa-router";

  /**
   * BuildRow — DESIGN.md §3 Components.
   * Build Status Response 의 한 row. StatusPill + buildId(mono) + updatedAt(relative).
   */
  type BuildRowData = {
    buildId: string;
    status: string;
    projectId: string;
    repositoryId: string;
    updatedAt: string; // ISO 8601
  };

  let { build }: { build: BuildRowData } = $props();

  function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - then);
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  let updated = $derived(relativeTime(build.updatedAt));
</script>

<tr class="row" data-testid="build-row">
  <td class="status-cell">
    <StatusPill status={build.status} />
  </td>
  <td class="id-cell">
    <a use:link href={`/builds/${build.buildId}`} class="mono">{build.buildId.slice(0, 8)}</a>
  </td>
  <td class="meta-cell">{build.projectId}</td>
  <td class="meta-cell">{build.repositoryId}</td>
  <td class="time-cell" title={build.updatedAt}>{updated}</td>
</tr>

<style>
  .row {
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .row:hover { background: var(--color-bg-surface-elevated); }
  td {
    padding: var(--space-sm) var(--space-md);
    height: 36px;
    vertical-align: middle;
  }
  .id-cell .mono {
    font-size: var(--size-sm);
  }
  .meta-cell {
    color: var(--color-text-secondary);
    font-size: var(--size-sm);
  }
  .time-cell {
    color: var(--color-text-muted);
    font-size: var(--size-sm);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
