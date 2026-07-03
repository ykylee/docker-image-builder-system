<script lang="ts">
  import { onMount } from "svelte";
  import StatusPill from "../components/StatusPill.svelte";
  import PhaseTimeline from "../components/PhaseTimeline.svelte";
  import LogStream from "../components/LogStream.svelte";
  import type { BuildStatusResponse, BuildLogsResponse } from "../lib/api";
  import { getBuild, getBuildLogs } from "../lib/api";

  let { params }: { params?: { buildId?: string } } = $props();
  let buildId = $derived(params?.buildId ?? "");

  let build = $state<BuildStatusResponse | null>(null);
  let logs = $state<BuildLogsResponse | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const [b, l] = await Promise.all([
        getBuild(buildId),
        getBuildLogs(buildId).catch(() => null)
      ]);
      build = b;
      logs = l;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  });
</script>

<section class="detail">
  {#if loading}
    <p class="muted">Loading build {buildId}…</p>
  {:else if error || !build}
    <p class="err" role="alert">{error ?? "Build not found."}</p>
  {:else}
    <header class="head">
      <h1 class="mono">{build.buildId}</h1>
      <StatusPill status={build.status} />
    </header>
    <dl class="meta">
      <div><dt>Project</dt><dd>{build.projectId}</dd></div>
      <div><dt>Repository</dt><dd>{build.repositoryId}</dd></div>
      <div><dt>Created</dt><dd>{new Date(build.createdAt).toLocaleString()}</dd></div>
      <div><dt>Updated</dt><dd>{new Date(build.updatedAt).toLocaleString()}</dd></div>
    </dl>
    <section class="block">
      <h2>Phases</h2>
      <PhaseTimeline events={build.phases ?? []} />
    </section>
    <section class="block">
      <h2>Logs</h2>
      <LogStream entries={logs?.entries ?? []} />
    </section>
  {/if}
</section>

<style>
  .detail { display: flex; flex-direction: column; gap: var(--space-xl); }
  .head { display: flex; align-items: center; justify-content: space-between; }
  h1 { margin: 0; font-size: var(--size-lg); }
  .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-md); margin: 0; }
  .meta div { display: flex; flex-direction: column; gap: 2px; }
  dt { color: var(--color-text-muted); font-size: var(--size-xs); text-transform: uppercase; letter-spacing: 0.04em; }
  dd { margin: 0; color: var(--color-text-primary); font-size: var(--size-sm); }
  .block { display: flex; flex-direction: column; gap: var(--space-md); background: var(--color-bg-surface); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md); padding: var(--space-lg); }
  .block h2 { margin: 0; font-size: var(--size-md); font-weight: var(--weight-semibold); color: var(--color-text-secondary); }
  .muted { color: var(--color-text-muted); }
  .err { color: var(--color-accent-danger); }
</style>
