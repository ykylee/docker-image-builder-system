<script lang="ts">
  /**
   * LogStream — DESIGN.md §3 Components.
   * Monospace, since cursor 기반 증분 fetch (PR #6 1차 골격은 sample data).
   * auto-scroll 토글 후속.
   */
  type LogEntry = { id?: string; buildId?: string; phase: string; message: string; createdAt: string };

  let { entries }: { entries: LogEntry[] } = $props();
  let wrap = $state(false);
</script>

<div class="wrap">
  <div class="toolbar">
    <label>
      <input type="checkbox" bind:checked={wrap} /> wrap
    </label>
  </div>
  <pre class="stream" class:wrap>{#each entries as e (e.createdAt + e.message)}<span class="entry"><span class="at mono">{e.createdAt.slice(11, 19)}</span> <span class="phase mono">[{e.phase}]</span> {e.message}{'\n'}</span>{/each}</pre>
</div>

<style>
  .wrap { display: flex; flex-direction: column; gap: var(--space-sm); }
  .toolbar { display: flex; gap: var(--space-md); color: var(--color-text-secondary); font-size: var(--size-sm); }
  .stream {
    background: var(--color-bg-canvas);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    font-family: var(--font-mono);
    font-size: var(--size-sm);
    line-height: var(--line-normal);
    color: var(--color-text-primary);
    margin: 0;
    max-height: 360px;
    overflow: auto;
    white-space: pre;
  }
  .stream.wrap { white-space: pre-wrap; word-break: break-word; }
  .at { color: var(--color-text-muted); }
  .phase { color: var(--color-accent-primary); }
</style>
