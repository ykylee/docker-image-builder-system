<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import BuildRow from "../components/BuildRow.svelte";
  import type { AdminUserSummary, BuildSummary } from "../lib/api";
  import { listAdminBuilds, listAdminUsers } from "../lib/api";

  let adminId = $state<string | null>(null);
  let users = $state<AdminUserSummary[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // When the admin clicks a user row we set the selected user and load
  // their build history inline below the table. This keeps the page
  // self-contained: the admin can pivot from owner list to owner
  // builds without a route change.
  // TASK-060 2차 (PR #15): recent builds panel 은 BuildRow 가 아닌 직접
  // markup 으로 표시했는데, StatusPill 로 통일해 canonical lifecycleStatus
  // 까지 노출. lifecycleStatus 는 optional 이라 fallback 이 안전.
  // TASK-070 (PR #23): recent builds panel 을 동일한 BuildRow 컴포넌트
  // 로 교체하여 BuildsList / AdminBuilds 와 UI 정렬. 동일 user 의 build
  // 만 노출되는 inline expansion 이라 `requestedBy` 컬럼은 노이즈가 되므로
  // BuildRow 호출 시 owner 를 넘기지 않는다 (BuildRow 의 `requestedBy` 가
  // optional 이라 owner cell 미렌더). 외부 link (target=_blank) 도 제거
  // — svelte-spa-router `use:link` 가 일반 빌드 상세 라우트와 같은 탭
  // 라우팅을 제공 (admin 이 다른 페이지와 동일 패턴으로 일관성 있게
  // 탐색 가능).
  let selectedUser = $state<string | null>(null);
  let selectedBuilds = $state<BuildSummary[]>([]);
  let selectedLoading = $state(false);

  onMount(async () => {
    const stored = localStorage.getItem("adminId");
    if (!stored) {
      loading = false;
      push("/admin/login");
      return;
    }
    adminId = stored;
    await refresh(stored);
  });

  async function refresh(id: string) {
    loading = true;
    error = null;
    try {
      const result = await listAdminUsers(id);
      users = result.users;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function openUser(userId: string) {
    if (!adminId) return;
    selectedUser = userId;
    selectedLoading = true;
    try {
      const result = await listAdminBuilds(adminId, { requestedBy: userId, limit: 50 });
      // AdminListBuildsResponse.builds 의 entry 는 BuildSummary & { requestedBy } 이지만
      // selectedUser 의 inline expansion 라 owner 컬럼이 시각 노이즈가 되어
      // requestedBy 를 omit 해서 BuildRow 에게 넘긴다. (BuildRow 는 build
      // 의 requestedBy 가 있으면 owner cell 을 렌더하는 구조 — BuildRow.svelte
      // TASK-070 코멘트 참조.) 나머지 필드 (BuildSummary 전체) 는 그대로 보존.
      selectedBuilds = result.builds.map(({ requestedBy: _requestedBy, ...rest }) => rest);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      selectedLoading = false;
    }
  }

  function closeUser() {
    selectedUser = null;
    selectedBuilds = [];
  }

  // user 행의 lastBuildAt 표시용 relative time. BuildRow 는 자체
  // relativeTime 이 컴포넌트 안에 내장되어 있어 recent builds panel
  // 에서는 import 만 하면 끝이지만, 사용자 행 (Users 표) 의 lastBuildAt
  // cell 은 AdminUsers 측에서 직접 계산해야 한다.
  function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - then);
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }
</script>

<section class="page">
  <header class="page-head">
    <div>
      <h1>Users</h1>
      <p class="muted">
        {users.length} user{users.length === 1 ? "" : "s"} with build history.
        Click a row to inspect that user's builds.
      </p>
    </div>
  </header>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else if error}
    <p class="err" role="alert">{error}</p>
  {:else if users.length === 0}
    <p class="muted">No users yet.</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>User</th>
          <th class="r">Builds</th>
          <th class="r">Last activity</th>
        </tr>
      </thead>
      <tbody>
        {#each users as u (u.userId)}
          <tr
            class="row"
            class:selected={selectedUser === u.userId}
            onclick={() => openUser(u.userId)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openUser(u.userId);
              }
            }}
            role="button"
            tabindex="0"
            aria-label={`Open ${u.userId}'s builds`}
          >
            <td class="user-cell mono">@{u.userId}</td>
            <td class="r count-cell">{u.buildCount}</td>
            <td class="r time-cell" title={u.lastBuildAt ?? ""}>
              {u.lastBuildAt ? relativeTime(u.lastBuildAt) : "—"}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  {#if selectedUser}
    <section class="user-builds">
      <header class="user-head">
        <h2>@{selectedUser} · recent builds</h2>
        <button type="button" class="btn-secondary" onclick={closeUser}>Close</button>
      </header>
      {#if selectedLoading}
        <p class="muted">Loading…</p>
      {:else if selectedBuilds.length === 0}
        <p class="muted">No builds found.</p>
      {:else}
        <!--
          TASK-070 (PR #23): 기존 inline `<ul class="build-list">` 마크업을
          BuildRow 컴포넌트 + `<table>` 구조로 교체. BuildsList / AdminBuilds 와
          동일한 5 컬럼 (StatusPill / buildId link / appName / optional owner /
          relative time) — 단, owner 컬럼은 같은 user 의 inline expansion이라
          시각 노이즈가 되므로 BuildRow 호출 시 owner 를 넘기지 않는다
          (BuildRow 내부 `{#if build.requestedBy}` 가드). BuildRow 의 외부
          svelte-spa-router `use:link` 가 같은 탭 라우팅을 제공.
        -->
        <table class="recent-builds" aria-label={`Recent builds for ${selectedUser}`}>
          <thead>
            <tr>
              <th>Status</th>
              <th>Build</th>
              <th>App</th>
              <th class="r">Updated</th>
            </tr>
          </thead>
          <tbody>
            {#each selectedBuilds as b (b.buildId)}
              <!-- requestedBy 미전달 → BuildRow 가 owner cell 미렌더. -->
              <BuildRow build={b} />
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
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
  h2 {
    margin: 0;
    font-size: var(--size-lg);
    font-weight: var(--weight-semibold);
    color: var(--color-text-primary);
  }
  .muted { color: var(--color-text-muted); margin: 4px 0 0; font-size: var(--size-sm); }
  .err { color: var(--color-accent-danger); }

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
  .row {
    cursor: pointer;
    transition: background-color var(--motion-duration-fast) var(--motion-easing-standard);
  }
  .row:hover { background: var(--color-bg-surface-elevated); }
  .row.selected {
    background: var(--color-bg-canvas);
    box-shadow: inset 3px 0 0 var(--color-accent-primary);
  }
  .row td {
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--color-border-subtle);
    height: 48px;
    vertical-align: middle;
  }
  :global(tbody > tr.row:last-child) td { border-bottom: none; }
  .user-cell {
    color: var(--color-text-primary);
    font-size: var(--size-sm);
    font-weight: var(--weight-semibold);
  }
  .count-cell {
    color: var(--color-text-secondary);
    font-size: var(--size-sm);
    font-variant-numeric: tabular-nums;
  }
  .time-cell {
    color: var(--color-text-muted);
    font-size: var(--size-sm);
    font-variant-numeric: tabular-nums;
  }
  .r { text-align: right; }

  .user-builds {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    padding: var(--space-lg) var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  .user-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  /* TASK-070 (PR #23): recent builds panel 도 BuildsList / AdminBuilds 의
     사용자 / admin 표와 동일한 `<table>` 모양 (surface / border-subtle /
     radius-lg / shadow-card / overflow-hidden) 으로 통일. 위 일반 `table`
     셀렉터 의 background + border + radius + shadow + overflow 가 모두
     상속되어 추가 표면 디자인 없이 정합. 헤더 thead th 의 padding /
     background / color / uppercase 도 동일 셀렉터가 적용. 마지막 row 의
     하단 border 는 BuildRow 자체의 `:global(tbody > tr.row:last-child) td`
     가드와 정합. */
  .recent-builds th.r { text-align: right; }
  .btn-secondary {
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    background: var(--color-bg-surface-elevated);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border-strong);
    font-size: var(--size-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }
  .btn-secondary:hover {
    color: var(--color-text-primary);
    background: var(--color-bg-canvas);
  }
</style>
