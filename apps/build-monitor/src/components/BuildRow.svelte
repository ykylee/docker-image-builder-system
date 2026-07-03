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
    // Owner is optional so the user-facing BuildsList route can keep
    // using BuildRow without changes. AdminBuilds passes the canonical
    // requestedBy so the admin table can render the owner column.
    requestedBy?: string;
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
  {#if build.requestedBy}
    <td class="owner-cell mono">@{build.requestedBy}</td>
  {/if}
  <td class="time-cell" title={build.updatedAt}>{updated}</td>
</tr>

<style>
  .row {
    transition: background-color var(--motion-duration-fast) var(--motion-easing-standard);
  }
  .row:hover { 
    background: var(--color-bg-surface-elevated); 
  }
  .row td {
    border-bottom: 1px solid var(--color-border-subtle);
  }
  /* BuildRow 는 BuildsList 의 <table> 내부에서만 사용된다. 마지막 row
     의 하단 border 는 table 의 border-radius 와 겹치지 않도록 제거. */
  :global(tbody > tr.row:last-child) td {
    border-bottom: none;
  }
  td {
    padding: var(--space-md) var(--space-lg);
    height: 48px;
    vertical-align: middle;
  }
  .id-cell .mono {
    font-size: var(--size-sm);
    color: var(--color-accent-primary);
    font-weight: var(--weight-medium);
    transition: color var(--motion-duration-fast) var(--motion-easing-standard);
  }
  .id-cell .mono:hover {
    color: var(--color-accent-primary-hover);
  }
  .meta-cell {
    color: var(--color-text-secondary);
    font-size: var(--size-sm);
    font-weight: var(--weight-medium);
  }
  .time-cell {
    color: var(--color-text-muted);
    font-size: var(--size-sm);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .owner-cell {
    color: var(--color-text-primary);
    font-size: var(--size-sm);
    font-weight: var(--weight-semibold);
    background: var(--color-bg-surface-elevated);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-border-subtle);
    width: max-content;
  }
</style>
