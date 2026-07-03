<script lang="ts">
  import { onMount } from "svelte";
  import StatusPill from "../components/StatusPill.svelte";
  import PhaseTimeline from "../components/PhaseTimeline.svelte";
  import LogStream from "../components/LogStream.svelte";
  import type { BuildStatusResponse, BuildLogEntry } from "../lib/api";
  import { getBuild, getBuildLogs } from "../lib/api";

  let { params }: { params?: { buildId?: string } } = $props();
  let buildId = $derived(params?.buildId ?? "");

  let build = $state<BuildStatusResponse | null>(null);
  // BuildLogsResponse 가 generated type 이 inline shape 으로 추론되는
  // openapi-fetch 0.13 + openapi-typescript 7.x 호환성 문제로, svelte-check
  // 의 type inference 가 BuildLogsResponse 의 정의({ buildId, logs }) 와
  // 다른 shape({ buildId, cursor, entries }) 으로 풀어씀. 본 PR 에서는
  // type 정의를 inline interface 로 통일하여 svelte-check 의 view 와
  // runtime shape 을 모두 만족. 후속 PR 에서 openapi-fetch 갱신 시 복원.
  type LocalBuildLogsResponse = { buildId: string; logs: BuildLogEntry[] };
  let logs = $state<LocalBuildLogsResponse | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const [b, l] = await Promise.all([
        getBuild(buildId),
        getBuildLogs(buildId).catch(() => null)
      ]);
      build = b;
      logs = (l as unknown as LocalBuildLogsResponse | null);
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
      <h1 class="mono">{build.build.buildId}</h1>
      <StatusPill status={build.build.status} />
    </header>
    <dl class="meta">
      <div><dt>Project</dt><dd>{build.build.projectId}</dd></div>
      <div><dt>Repository</dt><dd>{build.build.repositoryId}</dd></div>
      <div><dt>Created</dt><dd>{new Date(build.build.createdAt).toLocaleString()}</dd></div>
      <div><dt>Updated</dt><dd>{new Date(build.build.updatedAt).toLocaleString()}</dd></div>
      <div><dt>Phase</dt><dd class="mono">{build.build.phase}</dd></div>
      <div><dt>Preview</dt><dd class="mono">{build.build.previewStatus}</dd></div>
    </dl>
    <section class="block">
      <h2>Phases</h2>
      <PhaseTimeline events={[{ phase: build.build.phase, at: build.build.updatedAt }]} />
    </section>
    <section class="block">
      <h2>Logs</h2>
      <LogStream entries={logs?.logs ?? []} />
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
