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
  .wrap { 
    display: flex; 
    flex-direction: column; 
    gap: var(--space-md); 
  }
  .toolbar { 
    display: flex; 
    gap: var(--space-md); 
    color: var(--color-text-secondary); 
    font-size: var(--size-sm); 
    align-items: center;
    background: var(--color-bg-canvas);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border-subtle);
    width: fit-content;
  }
  .toolbar input {
    accent-color: var(--color-accent-primary);
  }
  .stream {
    background: #0b0c10; /* Always dark for terminal feel */
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    padding: var(--space-lg);
    font-family: var(--font-mono);
    font-size: var(--size-sm);
    line-height: var(--line-relaxed);
    color: #e2e8f0;
    margin: 0;
    max-height: 480px;
    overflow: auto;
    white-space: pre;
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
  }
  .stream.wrap { 
    white-space: pre-wrap; 
    word-break: break-word; 
  }
  .at { color: #64748b; }
  .phase { color: #38bdf8; font-weight: var(--weight-semibold); }
</style>
