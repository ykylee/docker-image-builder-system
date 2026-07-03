<script lang="ts">
  import { onMount } from "svelte";
  import BuildRow from "../components/BuildRow.svelte";
  import type { BuildSummary } from "../lib/api";
  import { listBuilds } from "../lib/api";

  let builds = $state<BuildSummary[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const result = await listBuilds();
      builds = result.builds;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  });

  // status filter chips
  let filter = $state<"ALL" | "BUILDING" | "COMPLETED" | "FAILED">("ALL");
  let visible = $derived(
    filter === "ALL" ? builds : builds.filter((b) => b.status === filter)
  );
</script>

<section class="list-page">
  <header class="page-head">
    <h1>Builds</h1>
    <div class="chips" role="group" aria-label="Status filter">
      {#each ["ALL", "BUILDING", "COMPLETED", "FAILED"] as f (f)}
        <button
          type="button"
          class="chip"
          class:active={filter === f}
          aria-pressed={filter === f}
          onclick={() => (filter = f as typeof filter)}
        >{f}</button>
      {/each}
    </div>
  </header>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else if error}
    <p class="err" role="alert">{error}</p>
  {:else if visible.length === 0}
    <p class="muted">No builds.</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Build</th>
          <th>Project</th>
          <th>Repository</th>
          <th class="r">Updated</th>
        </tr>
      </thead>
      <tbody>
        {#each visible as b (b.buildId)}
          <BuildRow build={b} />
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .list-page { display: flex; flex-direction: column; gap: var(--space-lg); }
  .page-head { display: flex; align-items: center; justify-content: space-between; }
  h1 { margin: 0; font-size: var(--size-xl); font-weight: var(--weight-semibold); }
  .chips { display: inline-flex; gap: var(--space-sm); }
  .chip {
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-pill);
    background: var(--color-bg-surface);
    color: var(--color-text-secondary);
    font-size: var(--size-sm);
    border: 1px solid var(--color-border-subtle);
  }
  .chip.active { background: var(--color-accent-primary); color: white; border-color: var(--color-accent-primary); }
  table { width: 100%; border-collapse: collapse; background: var(--color-bg-surface); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md); overflow: hidden; }
  thead th { text-align: left; padding: var(--space-sm) var(--space-md); background: var(--color-bg-surface-elevated); color: var(--color-text-secondary); font-size: var(--size-sm); font-weight: var(--weight-medium); border-bottom: 1px solid var(--color-border-subtle); }
  thead th.r { text-align: right; }
  .muted { color: var(--color-text-muted); }
  .err { color: var(--color-accent-danger); }
</style>
