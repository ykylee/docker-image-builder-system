<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import BuildRow from "../components/BuildRow.svelte";
  import type { BuildSummary } from "../lib/api";
  import { listBuilds } from "../lib/api";

  let builds = $state<BuildSummary[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    const stored = localStorage.getItem("userId");
    if (!stored) {
      // 인증 정보 없음 → loading 해제 후 로그인으로 라우팅.
      loading = false;
      push("/");
      return;
    }

    try {
      // 서버 측 requestedBy 필터에 canonical owner key 를 그대로 넘긴다.
      // (이전 PR 의 클라이언트 projectId.includes() 휴리스틱은 IDENTITY_MODEL
      // 의 userId 정의와 어긋나 제거함.)
      const result = await listBuilds({ requestedBy: stored });
      builds = result.builds;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  });

  // status filter chips
  let filter = $state<"ALL" | "BUILDING" | "COMPLETED" | "FAILED">("ALL");

  // status chip 만 클라이언트에서 적용 (서버는 requestedBy + status 동시
  // 필터 가능하지만 status 는 응답 사이즈가 작은 편이고, 사용자 토글 반응
  // 을 빠르게 주기 위해 chip 필터는 클라이언트에 둠).
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
  .list-page { 
    display: flex; 
    flex-direction: column; 
    gap: var(--space-xxl); 
    animation: fadeIn var(--motion-duration-slow) var(--motion-easing-standard);
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .page-head { 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
  }
  h1 { 
    margin: 0; 
    font-size: var(--size-xxl); 
    font-weight: var(--weight-semibold); 
    letter-spacing: -0.02em;
    background: linear-gradient(90deg, var(--color-text-primary), var(--color-text-muted));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .chips { 
    display: inline-flex; 
    gap: var(--space-sm); 
    background: var(--color-bg-surface);
    padding: var(--space-xs);
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-border-subtle);
    box-shadow: var(--shadow-card);
  }
  .chip {
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-text-secondary);
    font-size: var(--size-sm);
    font-weight: var(--weight-medium);
    border: 1px solid transparent;
    transition: all var(--motion-duration-fast) var(--motion-easing-standard);
  }
  .chip:hover {
    color: var(--color-text-primary);
  }
  .chip.active { 
    background: var(--color-accent-primary); 
    color: white; 
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
  }
  
  table { 
    width: 100%; 
    border-collapse: separate; 
    border-spacing: 0;
    background: var(--color-bg-surface); 
    border: 1px solid var(--color-border-subtle); 
    border-radius: var(--radius-lg); 
    box-shadow: var(--shadow-card);
    overflow: hidden; 
  }
  thead th { 
    text-align: left; 
    padding: var(--space-md) var(--space-lg); 
    background: var(--color-bg-surface-elevated); 
    color: var(--color-text-muted); 
    font-size: var(--size-xs); 
    font-weight: var(--weight-semibold); 
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--color-border-subtle); 
  }
  thead th.r { text-align: right; }
  .muted { color: var(--color-text-muted); }
  .err { color: var(--color-accent-danger); }
</style>
