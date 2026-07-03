<script lang="ts">
  /**
   * PhaseTimeline — DESIGN.md §3 Components.
   * 수직 step indicator. DOCKER_BUILD_STARTED → COMPLETED 같은 transition 시계열.
   * a11y: role="list" + 각 step role="listitem".
   */
  type PhaseEvent = {
    phase: string;
    at: string; // ISO 8601
  };

  let { events }: { events: PhaseEvent[] } = $props();
  let sorted = $derived(
    [...events].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  );
</script>

<ol class="timeline" role="list" aria-label="Build phase timeline">
  {#each sorted as e (e.at + e.phase)}
    <li class="step" role="listitem">
      <span class="dot" aria-hidden="true"></span>
      <div class="body">
        <div class="phase mono">{e.phase}</div>
        <div class="at">{new Date(e.at).toLocaleString()}</div>
      </div>
    </li>
  {/each}
  {#if sorted.length === 0}
    <li class="empty">No phase events yet.</li>
  {/if}
</ol>

<style>
  .timeline {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
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
    background: var(--color-accent-primary);
    box-shadow: 0 0 10px var(--color-accent-primary);
    margin-top: 6px;
    border: 2px solid var(--color-bg-surface);
  }
  .body { 
    display: flex; 
    flex-direction: column; 
    gap: 4px; 
  }
  .phase { 
    font-size: var(--size-sm); 
    font-weight: var(--weight-semibold); 
    color: var(--color-text-primary);
  }
  .at { 
    font-size: var(--size-xs); 
    color: var(--color-text-muted); 
  }
  .empty { 
    color: var(--color-text-muted); 
    font-size: var(--size-sm); 
    padding: var(--space-sm); 
  }
</style>
