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
      <StatusPill
        status={build.build.status}
        lifecycleStatus={build.build.lifecycleStatus}
      />
    </header>
    <dl class="meta">
      <div><dt>App</dt><dd class="mono">{build.build.appName}</dd></div>
      <div><dt>Created</dt><dd>{new Date(build.build.createdAt).toLocaleString()}</dd></div>
      <div><dt>Updated</dt><dd>{new Date(build.build.updatedAt).toLocaleString()}</dd></div>
      <div><dt>Phase</dt><dd class="mono">{build.build.phase}</dd></div>
      <div><dt>Lifecycle</dt><dd class="mono">{build.build.lifecycleStatus ?? build.build.status}</dd></div>
      <div>
        <dt>Last error</dt>
        <dd class="mono">
          {build.lastError ? `${build.lastError.code}: ${build.lastError.message}` : "—"}
        </dd>
      </div>
    </dl>
    <!-- TASK-060: canonical build/test/deploy/result-delivery sections.
         These are the source of truth for the build lifecycle and replace
         the preview-era `previewStatus` / `previewUrl` fields below. The
         section heading "Build lifecycle" distinguishes this detailed
         snapshot (BuildStatusResponse.lifecycle) from the short "Lifecycle"
         label in the meta row above (lifecycleStatus). -->
    <section class="block">
      <h2>Build lifecycle</h2>
      <dl class="kv">
        <div>
          <dt>Status</dt>
          <dd class="mono">{build.lifecycle?.status ?? build.build.lifecycleStatus ?? build.build.status}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{build.lifecycle?.startedAt ? new Date(build.lifecycle.startedAt).toLocaleString() : "—"}</dd>
        </div>
        <div>
          <dt>Finished</dt>
          <dd>{build.lifecycle?.finishedAt ? new Date(build.lifecycle.finishedAt).toLocaleString() : "—"}</dd>
        </div>
      </dl>
    </section>
    <section class="block">
      <h2>Container test</h2>
      <dl class="kv">
        <div>
          <dt>Status</dt>
          <dd class="mono">{build.test?.status ?? "NOT_STARTED"}</dd>
        </div>
        <div>
          <dt>Container running</dt>
          <dd>{build.test?.containerRunning ?? "—"}</dd>
        </div>
        <div>
          <dt>Health check</dt>
          <dd>{build.test?.healthCheckPassed ?? "—"}</dd>
        </div>
        <div>
          <dt>Port open</dt>
          <dd>{build.test?.portOpen ?? "—"}</dd>
        </div>
        <div>
          <dt>Stability window</dt>
          <dd>{build.test?.stabilityWindowPassed ?? "—"}</dd>
        </div>
      </dl>
    </section>
    <section class="block">
      <h2>Deployment</h2>
      <dl class="kv">
        <div>
          <dt>Status</dt>
          <dd class="mono">{build.deploy?.status ?? "NOT_STARTED"}</dd>
        </div>
        <div>
          <dt>Target type</dt>
          <dd class="mono">{build.deploy?.targetType ?? "—"}</dd>
        </div>
        <div>
          <dt>Result ref</dt>
          <dd class="mono">{build.deploy?.resultRef ?? "—"}</dd>
        </div>
      </dl>
    </section>
    <section class="block">
      <h2>Result delivery</h2>
      <dl class="kv">
        <div>
          <dt>Status</dt>
          <dd class="mono">{build.resultDelivery?.status ?? "NOT_STARTED"}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd class="mono">{build.resultDelivery?.mode ?? "—"}</dd>
        </div>
        <div>
          <dt>Delivered at</dt>
          <dd>{build.resultDelivery?.deliveredAt ? new Date(build.resultDelivery.deliveredAt).toLocaleString() : "—"}</dd>
        </div>
      </dl>
    </section>
    <section class="block">
      <h2>Phases</h2>
      <PhaseTimeline
        phaseHistory={build.phaseHistory ?? []}
        currentPhase={build.currentPhase ?? null}
      />
    </section>
    <!-- Legacy preview-era fields. Kept for migration visibility; the canonical
         `test` and `deploy` blocks above are the source of truth. Removal is
         deferred to TASK-060 follow-up once all consumers migrate. -->
    <section class="block deprecated">
      <h2>Legacy preview <span class="badge">deprecated</span></h2>
      <dl class="kv">
        <div>
          <dt>Preview status</dt>
          <dd class="mono">{build.build.previewStatus}</dd>
        </div>
        <div>
          <dt>Preview URL</dt>
          <dd class="mono">{build.build.previewUrl ?? "—"}</dd>
        </div>
      </dl>
      <p class="muted small">
        Source of truth: see the <strong>Container test</strong> and
        <strong>Deployment</strong> sections above. Removal planned once
        admin / build-list consumers stop reading these legacy fields.
      </p>
    </section>
    <section class="block">
      <h2>Logs</h2>
      <LogStream entries={logs?.logs ?? []} />
    </section>
  {/if}
</section>

<style>
  .detail { 
    display: flex; 
    flex-direction: column; 
    gap: var(--space-xxl); 
    animation: fadeIn var(--motion-duration-slow) var(--motion-easing-standard);
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .head { 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
    padding: var(--space-lg) var(--space-xl);
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
  }
  h1 { 
    margin: 0; 
    font-size: var(--size-xl); 
    color: var(--color-text-primary);
  }
  .meta { 
    display: grid; 
    grid-template-columns: repeat(3, minmax(0, 1fr)); 
    gap: var(--space-lg); 
    margin: 0; 
    padding: var(--space-xl);
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
  }
  .meta div { 
    display: flex; 
    flex-direction: column; 
    gap: var(--space-xs); 
  }
  dt { 
    color: var(--color-text-muted); 
    font-size: var(--size-xs); 
    text-transform: uppercase; 
    letter-spacing: 0.05em; 
    font-weight: var(--weight-semibold);
  }
  dd { 
    margin: 0; 
    color: var(--color-text-primary); 
    font-size: var(--size-md); 
    font-weight: var(--weight-medium);
  }
  .block { 
    display: flex; 
    flex-direction: column; 
    gap: var(--space-lg); 
    background: var(--color-bg-surface); 
    border: 1px solid var(--color-border-subtle); 
    border-radius: var(--radius-lg); 
    padding: var(--space-xl); 
    box-shadow: var(--shadow-card);
  }
  .block h2 { 
    margin: 0; 
    font-size: var(--size-lg); 
    font-weight: var(--weight-semibold); 
    color: var(--color-text-primary); 
    border-bottom: 1px solid var(--color-border-subtle);
    padding-bottom: var(--space-md);
  }
  .muted { color: var(--color-text-muted); }
  .err { color: var(--color-accent-danger); }
  .kv {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-md);
    margin: 0;
  }
  @media (max-width: 640px) {
    .kv {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .kv div {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .kv dt {
    color: var(--color-text-muted);
    font-size: var(--size-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: var(--weight-semibold);
  }
  .kv dd {
    margin: 0;
    color: var(--color-text-primary);
    font-size: var(--size-md);
    font-weight: var(--weight-medium);
  }
  .deprecated {
    border-color: var(--color-border-subtle);
    background: color-mix(in srgb, var(--color-bg-surface) 92%, transparent);
  }
  .deprecated h2 {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }
  .badge {
    display: inline-block;
    padding: 2px var(--space-sm);
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--color-accent-warning) 18%, transparent);
    color: var(--color-accent-warning);
    font-size: var(--size-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .small { font-size: var(--size-xs); }
</style>
