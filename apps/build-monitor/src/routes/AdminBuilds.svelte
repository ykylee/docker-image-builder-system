<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import BuildRow from "../components/BuildRow.svelte";
  import type { AdminUserBuildSummary, BuildSummary } from "../lib/api";
  import { listAdminBuilds } from "../lib/api";

  // The admin response carries an extra requestedBy field on top of
  // BuildSummary. We keep the local state as the admin type so the
  // Owner column below can read it, and cast to BuildSummary when
  // passing rows to <BuildRow> (which only reads the canonical fields).
  let builds = $state<AdminUserBuildSummary[]>([]);
  function asBuildSummary(b: AdminUserBuildSummary): BuildSummary & { requestedBy?: string } {
    return b;
  }
  let loading = $state(true);
  let error = $state<string | null>(null);
  let adminId = $state<string | null>(null);

  // Owner filter is exposed so the admin can drill into one user's
  // build list. The text input is debounced only by the click of the
  // "Apply" button to keep the change explicit and to avoid extra calls
  // per keystroke. The list page also accepts `?owner=foo` from a deep
  // link from AdminUsers, which seeds the filter on mount.
  let ownerFilter = $state("");

  onMount(async () => {
    const stored = localStorage.getItem("adminId");
    if (!stored) {
      loading = false;
      push("/admin/login");
      return;
    }
    adminId = stored;
    await refresh(stored, ownerFilter);
  });

  async function refresh(id: string, owner: string) {
    loading = true;
    error = null;
    try {
      const result = await listAdminBuilds(id, {
        requestedBy: owner.trim() || undefined
      });
      builds = result.builds;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function applyFilter() {
    if (adminId) {
      await refresh(adminId, ownerFilter);
    }
  }

  async function clearFilter() {
    ownerFilter = "";
    if (adminId) {
      await refresh(adminId, "");
    }
  }

  // client-side status chip (server already does the heavy filtering).
  let filter = $state<"ALL" | "BUILDING" | "COMPLETED" | "FAILED">("ALL");
  // TASK-060 3차 (PR #16): canonical lifecycleStatus 와 legacy status 양쪽
  // 매칭. canonical success 계열은 COMPLETED chip 으로 분류되어 BUILDING
  // chip 에서 제외. helper 는 `src/lib/chipFilter.ts` 단일 source-of-truth.
  import { matchesChip } from "../lib/chipFilter.js";
  let visible = $derived(
    filter === "ALL" ? builds : builds.filter((b) => matchesChip(b, filter))
  );
</script>

<section class="page">
  <header class="page-head">
    <div>
      <h1>All Builds</h1>
      <p class="muted">
        {builds.length} build{builds.length === 1 ? "" : "s"}
        {ownerFilter ? `for @${ownerFilter}` : "across all owners"}
      </p>
    </div>
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

  <form class="owner-filter" onsubmit={(e) => { e.preventDefault(); applyFilter(); }}>
    <label for="owner">Owner</label>
    <input
      id="owner"
      type="text"
      bind:value={ownerFilter}
      placeholder="user id (e.g. alice)"
    />
    <button type="submit" class="btn-primary" disabled={loading}>Apply</button>
    <button type="button" class="btn-secondary" onclick={clearFilter} disabled={loading}>Clear</button>
  </form>

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
          <th>Owner</th>
          <th class="r">Updated</th>
        </tr>
      </thead>
      <tbody>
        {#each visible as b (b.buildId)}
          <BuildRow build={asBuildSummary(b)} />
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .page {
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
    gap: var(--space-lg);
    flex-wrap: wrap;
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
  .muted { color: var(--color-text-muted); margin: 4px 0 0; font-size: var(--size-sm); }
  .err { color: var(--color-accent-danger); }
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
  .chip:hover { color: var(--color-text-primary); }
  .chip.active {
    background: var(--color-accent-primary);
    color: white;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
  }

  .owner-filter {
    display: flex;
    align-items: end;
    gap: var(--space-md);
    flex-wrap: wrap;
  }
  .owner-filter label {
    font-size: var(--size-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .owner-filter input {
    flex: 1 1 240px;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-strong);
    background: var(--color-bg-canvas);
    color: var(--color-text-primary);
    font-size: var(--size-md);
    transition: all var(--motion-duration-fast) var(--motion-easing-standard);
  }
  .owner-filter input:focus {
    outline: none;
    border-color: var(--color-accent-primary);
    box-shadow: 0 0 0 2px var(--color-focus-ring);
  }
  .btn-primary,
  .btn-secondary {
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-md);
    font-size: var(--size-sm);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    transition: all var(--motion-duration-fast) var(--motion-easing-standard);
  }
  .btn-primary {
    background: var(--color-accent-primary);
    color: white;
    border: 1px solid transparent;
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--color-accent-primary-hover);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
  }
  .btn-secondary {
    background: var(--color-bg-surface-elevated);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border-strong);
  }
  .btn-secondary:hover:not(:disabled) {
    color: var(--color-text-primary);
    background: var(--color-bg-canvas);
  }
  .btn-primary:disabled,
  .btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }

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
</style>
