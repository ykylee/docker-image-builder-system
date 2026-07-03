<script lang="ts">
  /**
   * AdminAdmins — admin allow-list management page (TASK-049).
   *
   * The page is reachable only by callers that the build-monitor
   * recognizes as admin. The admin allow-list itself comes from the
   * Build Server (`GET /admin/admins`); this route is a thin UI over
   * the list/add/remove endpoints. The Header (TASK-048) auto-shows
   * the "Admin · Admins" link when the caller's userId is in the
   * allow-list, so this page is the first surface where a new admin
   * can manage who else gets admin.
   */
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { adminIdStore, userIdStore } from "../lib/session.js";
  import { adminAllowListStore } from "../lib/admin-store.js";
  import type { AdminAllowListResponse, AdminAllowListRemoveResponse } from "../lib/api.js";

  let adminId = $derived($adminIdStore);
  let userId = $derived($userIdStore);
  let admins = $derived($adminAllowListStore);

  // effective admin id (admin session OR auto-enable via userId)
  let effectiveAdminId = $derived(adminId ?? userId);

  let newAdminId = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);

  // 초기 로드 + adminId 가 없으면 login 으로 redirect.
  onMount(async () => {
    if (!effectiveAdminId) {
      push("/admin/login");
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

  async function add() {
    if (!effectiveAdminId) return;
    const trimmed = newAdminId.trim();
    if (!trimmed) {
      error = "Admin id 는 비어 있을 수 없습니다.";
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

<section class="admin-admins">
  <h1>Admin · Admins</h1>
  <p class="muted">
    현재 admin allow-list (Build Server <code>runtime.adminIds</code> 시드 + POST /admin/admins
    으로 추가된 항목). 첫 항목은 시드 보호 id (삭제 불가). 변경 사항은 in-process
    만 반영되며 process 재시작 후 ADMIN_IDS env 가 canonical.
  </p>

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
</section>

<style>
  .admin-admins {
    max-width: 720px;
    margin: 0 auto;
  }
  h1 {
    font-size: var(--size-2xl);
    font-weight: var(--weight-semibold);
    margin: 0 0 var(--space-sm);
  }
  .muted {
    color: var(--color-text-muted);
    font-size: var(--size-sm);
    margin: 0 0 var(--space-lg);
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
