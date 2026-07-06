<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import AdminTabs from "../components/AdminTabs.svelte";
  // TASK-083: status filter chip 디자인을 canonical FilterChips 컴포넌트
  // 로 승격. AdminBuilds / AdminRunners 양쪽 페이지의 중복 `.chips + .chip
  // + .chip.active` CSS 를 단일 source 로 통합하고, active glow 의 raw
  // rgba 는 디자인 토큰 `--shadow-glow` 로 정렬해 dark / light 모드별 자동
  // follow. BuildSummary success / failed 와 AdminRunner ACTIVE / DISABLED 의
  // StatusPill 컬러와 동등 의미 (현재 활성 segment) 로 톤 통일.
  import FilterChips from "../components/FilterChips.svelte";
  import BuildRow from "../components/BuildRow.svelte";
  import type { AdminUserBuildSummary, BuildSummary } from "../lib/api";
  import { listAdminBuilds } from "../lib/api";
  import { userIdStore } from "../lib/session.js";

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
  // TASK-076: admin 권한은 userId 그 자체다. 별도 adminId store 가
  // 사라졌으므로 `X-Admin-Id` 헤더도 userId 로 보낸다. userId 가
  // admin allow-list 에 없으면 backend 가 403 으로 거부하고 화면에
  // 에러 메시지가 노출된다.
  let userId = $derived($userIdStore);

  // Owner filter is exposed so the admin can drill into one user's
  // build list. The text input is debounced only by the click of the
  // "Apply" button to keep the change explicit and to avoid extra calls
  // per keystroke. The list page also accepts `?owner=foo` from a deep
  // link from AdminUsers, which seeds the filter on mount.
  let ownerFilter = $state("");

  onMount(async () => {
    // userId 가 없으면 Login 페이지로 redirect (TASK-076: 더 이상
    // /admin/login 으로 가지 않는다 — admin 진입점은 일반 Login 과
    // 동일하다). AdminUsers/AdminAdmins/AdminRunners 와 동일한 single-
    // check 패턴 — 다른 탭에서 logout/login 발생 시 페이지 재방문 /
    // 다음 navigation 에서 최신 userId 반영.
    if (!userId) {
      loading = false;
      push("/");
      return;
    }
    await refresh(userId, ownerFilter);
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
    if (userId) {
      await refresh(userId, ownerFilter);
    }
  }

  async function clearFilter() {
    ownerFilter = "";
    if (userId) {
      await refresh(userId, "");
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
  <AdminTabs />

  <header class="page-head">
    <div>
      <h1>All Builds</h1>
      <p class="muted">
        {builds.length} build{builds.length === 1 ? "" : "s"}
        {ownerFilter ? `for @${ownerFilter}` : "across all owners"}
      </p>
    </div>
    <FilterChips
      options={["ALL", "BUILDING", "COMPLETED", "FAILED"]}
      selected={filter}
      onSelect={(v) => (filter = v as typeof filter)}
      ariaLabel="Status filter"
    />
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
    /* 디자인 토큰 `--shadow-glow` 정렬 — dark / light 모드별 자동 follow
       (light rgba(79, 70, 229, 0.15), dark rgba(99, 102, 241, 0.3)).
       raw rgba 잔재 정리. (TASK-083) */
    box-shadow: var(--shadow-glow);
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
