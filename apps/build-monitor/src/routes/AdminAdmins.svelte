<script lang="ts">
  /**
   * AdminAdmins — admin allow-list management page (TASK-049 + TASK-076).
   *
   * The page is reachable only by callers that the build-monitor
   * recognizes as admin. The admin allow-list itself comes from the
   * Build Server (`GET /admin/admins`); this route is a thin UI over
   * the list/add/remove endpoints. The Header (TASK-048) auto-shows
   * the "Admin · Admins" link when the caller's userId is in the
   * allow-list, so this page is the first surface where a new admin
   * can manage who else gets admin.
   *
   * TASK-076: 별도 adminId store 가 사라졌다. effectiveAdminId = userId
   * 그 자체이며, admin 진입점은 일반 Login 과 동일하다.
   */
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import AdminTabs from "../components/AdminTabs.svelte";
  // TASK-084: 비-admin user 의 deep link 진입 시 frontend 가드.
  import AdminAccessDenied from "../components/AdminAccessDenied.svelte";
  import { userIdStore } from "../lib/session.js";
  import { adminAllowListStore } from "../lib/admin-store.js";
  // TASK-084: ensureAdminAccess helper 가 adminAllowListStore 캐시 +
  // refresh 를 단일 source-of-truth 로 다룬다.
  import { ensureAdminAccess } from "../lib/admin-guard.js";
  import type { AdminAllowListResponse, AdminAllowListRemoveResponse } from "../lib/api.js";

  let userId = $derived($userIdStore);
  let admins = $derived($adminAllowListStore);

  // TASK-076: effective admin id = userId 그 자체. 별도 admin session 이
  // 없으므로 userId 만 체크하면 된다.
  let effectiveAdminId = $derived(userId);

  // TASK-084: 비-admin user 의 deep link 진입 시 backend 호출 없이
  // frontend 에서 거부 → AdminAccessDenied 패널 노출.
  let accessDenied = $state<null | {
    reason: "NO_USER" | "FORBIDDEN" | "NOT_IN_ALLOW_LIST";
  }>(null);

  let newAdminId = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);

  // 초기 로드 + userId 가 없으면 login 으로 redirect (TASK-076: 더 이상
  // /admin/login 으로 가지 않는다 — admin 진입점은 일반 Login 과 동일).
  onMount(async () => {
    if (!effectiveAdminId) {
      push("/");
      return;
    }
    // TASK-084: backend 호출 전 frontend admin 가드. 비-admin user 의
    // raw 403 envelope 대신 친절한 패널을 노출한다.
    const guard = await ensureAdminAccess(effectiveAdminId);
    if (!guard.isAdmin) {
      accessDenied = { reason: guard.reason };
      busy = false;
      return;
    }
    try {
      busy = true;
      error = null;
      await adminAllowListStore.refresh(effectiveAdminId);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  });

  // canonical admin id pattern. server schema 와 동일하게 letter / digit /
  // dot / underscore / hyphen 만 허용. client-side pre-check 로 잘못된
  // 요청이 backend 까지 가지 않게 막는다.
  const ADMIN_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

  async function add() {
    if (!effectiveAdminId) return;
    const trimmed = newAdminId.trim();
    if (!trimmed) {
      error = "Admin id 는 비어 있을 수 없습니다.";
      return;
    }
    if (!ADMIN_ID_PATTERN.test(trimmed)) {
      error = `Admin id 는 letters / digits / dot / underscore / hyphen 만 가능합니다: ${trimmed}`;
      return;
    }
    if (admins.includes(trimmed)) {
      error = `이미 allow-list 에 있습니다: ${trimmed}`;
      return;
    }
    try {
      busy = true;
      error = null;
      const res: AdminAllowListResponse = await adminAllowListStore.add(
        effectiveAdminId,
        trimmed
      );
      newAdminId = "";
      admins = res.admins;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function remove(target: string) {
    if (!effectiveAdminId) return;
    try {
      busy = true;
      error = null;
      const res: AdminAllowListRemoveResponse = await adminAllowListStore.remove(
        effectiveAdminId,
        target
      );
      admins = res.admins;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

{#if accessDenied}
  <AdminAccessDenied userId={userId} reason={accessDenied.reason} />
{:else}
<section class="page">
  <!-- TASK-083: page 구조를 다른 admin 페이지 (Builds / Users /
       Runners) 와 통일. `.page` wrapper + `<header class="page-head">`
       컨테이너 + fadeIn 애니메이션 + h1 gradient text + var(--size-xxl).
       table 영역만 `.admins-content` 인너 컨테이너 (max-width 720) 로
       좁게 묶어 admin allow-list 의 좁은 폭 디자인 의도는 보존. -->
  <AdminTabs />

  <header class="page-head">
    <div>
      <h1>Admins</h1>
      <p class="muted">
        현재 admin allow-list (Build Server <code>runtime.adminIds</code> 시드 + POST /admin/admins
        으로 추가된 항목). 첫 항목은 시드 보호 id (삭제 불가). 변경 사항은 in-process
        만 반영되며 process 재시작 후 ADMIN_IDS env 가 canonical.
      </p>
    </div>
  </header>

  <div class="admins-content">

  {#if error}
    <div class="banner banner-error" role="alert">{error}</div>
  {/if}

  <form
    class="add-form"
    onsubmit={(e) => {
      e.preventDefault();
      add();
    }}
  >
    <label>
      New admin id
      <input
        type="text"
        bind:value={newAdminId}
        placeholder="userId"
        disabled={busy}
        autocomplete="off"
      />
    </label>
    <button type="submit" class="btn-primary" disabled={busy || !newAdminId.trim()}>
      Add admin
    </button>
  </form>

  <table class="admins-table">
    <thead>
      <tr>
        <th>Admin id</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each admins as admin, idx (admin)}
        <tr class:protected={idx === 0}>
          <td class="mono">
            @{admin}
            {#if idx === 0}
              <span class="badge">seed (protected)</span>
            {/if}
            {#if admin === effectiveAdminId}
              <span class="badge badge-self">you</span>
            {/if}
          </td>
          <td>
            <button
              type="button"
              class="btn-danger"
              disabled={busy || idx === 0}
              title={idx === 0 ? "seed id 는 삭제할 수 없습니다" : "Remove admin"}
              onclick={() => remove(admin)}
            >
              Remove
            </button>
          </td>
        </tr>
      {/each}
      {#if admins.length === 0}
        <tr>
          <td colspan="2" class="empty">allow-list 가 비어 있습니다.</td>
        </tr>
      {/if}
    </tbody>
  </table>
  </div>
</section>
{/if}

<style>
  /* TASK-083: page wrapper 정합. 다른 admin 페이지 (Builds / Users /
     Runners) 와 동일하게 `.page` + fadeIn + `<header class="page-head">`
     컨테이너 + h1 gradient text + var(--size-xxl). 한 페이지에서 헤더
     디자인 토큰이 단일 source. 인너 `.admins-content` 만 max-width 720 으로
     좁게 유지 (admin allow-list 의 row 가 적어 좁은 폭이 자연). */
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
  .muted {
    color: var(--color-text-muted);
    margin: 4px 0 0;
    font-size: var(--size-sm);
  }
  /* allow-list 본문만 좁은 폭. 다른 admin 페이지의 폭 100% table 과
     의도적 차이. (TASK-083) */
  .admins-content {
    max-width: 720px;
    margin: 0 auto;
    width: 100%;
  }
  .banner {
    padding: var(--space-md);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-md);
    font-size: var(--size-sm);
  }
  .banner-error {
    background: color-mix(in srgb, var(--color-accent-danger) 15%, transparent);
    color: var(--color-accent-danger);
    border: 1px solid color-mix(in srgb, var(--color-accent-danger) 40%, transparent);
  }
  .add-form {
    display: flex;
    gap: var(--space-md);
    align-items: flex-end;
    margin-bottom: var(--space-lg);
  }
  .add-form label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    font-size: var(--size-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .add-form input {
    width: 100%;
    padding: var(--space-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-strong);
    background: var(--color-bg-canvas);
    color: var(--color-text-primary);
    font-family: var(--font-mono);
    font-size: var(--size-md);
    transition: all var(--motion-duration-fast) var(--motion-easing-standard);
  }
  .add-form input:focus {
    outline: none;
    border-color: var(--color-accent-primary);
    box-shadow: 0 0 0 2px var(--color-focus-ring);
  }
  .btn-primary {
    padding: var(--space-md) var(--space-lg);
    border-radius: var(--radius-md);
    background: var(--color-accent-primary);
    color: white;
    font-size: var(--size-md);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    border: none;
    transition: all var(--motion-duration-fast) var(--motion-easing-standard);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--color-accent-primary-hover);
    transform: translateY(-1px);
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .admins-table {
    width: 100%;
    border-collapse: collapse;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .admins-table th,
  .admins-table td {
    padding: var(--space-md) var(--space-lg);
    text-align: left;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .admins-table th {
    background: var(--color-bg-surface-elevated);
    font-size: var(--size-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .admins-table tr.protected td {
    background: color-mix(in srgb, var(--color-accent-info) 8%, transparent);
  }
  .admins-table tr:last-child td {
    border-bottom: none;
  }
  .badge {
    display: inline-block;
    margin-left: var(--space-sm);
    padding: 2px var(--space-sm);
    border-radius: var(--radius-pill);
    font-size: var(--size-xs);
    font-weight: var(--weight-medium);
    background: color-mix(in srgb, var(--color-accent-info) 18%, transparent);
    color: var(--color-accent-info);
  }
  .badge-self {
    background: color-mix(in srgb, var(--color-accent-primary) 18%, transparent);
    color: var(--color-accent-primary);
  }
  .btn-danger {
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--color-accent-danger) 15%, transparent);
    color: var(--color-accent-danger);
    border: 1px solid color-mix(in srgb, var(--color-accent-danger) 40%, transparent);
    font-size: var(--size-sm);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    transition: all var(--motion-duration-fast) var(--motion-easing-standard);
  }
  .btn-danger:hover:not(:disabled) {
    background: var(--color-accent-danger);
    color: white;
  }
  .btn-danger:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .empty {
    text-align: center;
    color: var(--color-text-muted);
    padding: var(--space-xl);
  }
</style>
