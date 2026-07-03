<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import StatusPill from "../components/StatusPill.svelte";
  import type { AdminUserSummary } from "../lib/api";
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
  let selectedUser = $state<string | null>(null);
  let selectedBuilds = $state<
    {
      buildId: string;
      appName: string;
      status: string;
      lifecycleStatus?: string;
      updatedAt: string;
    }[]
  >([]);
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
      selectedBuilds = result.builds.map((b) => ({
        buildId: b.buildId,
        appName: b.appName,
        status: b.status,
        // TASK-052 lifecycleStatus — StatusPill forwarding.
        lifecycleStatus: b.lifecycleStatus,
        updatedAt: b.updatedAt
      }));
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
        <ul class="build-list">
          {#each selectedBuilds as b (b.buildId)}
            <li>
              <StatusPill status={b.status} lifecycleStatus={b.lifecycleStatus} />
              <a class="project mono" href={`/builds/${b.buildId}`} target="_blank" rel="noopener">{b.appName}</a>
              <span class="muted small">{b.buildId.slice(0, 8)}</span>
              <span class="muted small r">{relativeTime(b.updatedAt)}</span>
            </li>
          {/each}
        </ul>
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
  .small { font-size: var(--size-xs); }

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
  .build-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .build-list li {
    display: grid;
    grid-template-columns: 110px 1fr auto auto;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    background: var(--color-bg-canvas);
    border: 1px solid var(--color-border-subtle);
  }
  .project {
    color: var(--color-accent-primary);
    font-size: var(--size-sm);
    font-weight: var(--weight-medium);
  }
  .project:hover { text-decoration: underline; }

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
