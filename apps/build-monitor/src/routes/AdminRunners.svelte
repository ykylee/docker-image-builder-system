<script lang="ts">
  /**
   * AdminRunners — runner registry management page (TASK-069 + TASK-076).
   *
   * Runner self-registers on first claim (idempotent — `RUNNER_ID` env
   * 가 첫 claim 의 body 에 실려 옴). 이 페이지는 admin 의 가시성 +
   * 통제 surface:
   *
   *   - GET /admin/runners:            전체 registry snapshot
   *   - PATCH /admin/runners/:id:       DISABLE / REACTIVATE 토글
   *   - DELETE /admin/runners/:id:      영구 삭제 (idempotent)
   *
   * DISABLE 로 토글하면 다음 claim 부터 reason=RUNNER_DISABLED 로 거절된다
   * (in-flight 빌드만 완료되고 새 claim 못 잡음). Header (TASK-048) 가
   * admin allow-list 에 userId 가 있으면 auto-enable 해준다.
   *
   * TASK-076: 별도 adminId store 가 사라졌다. effectiveAdminId = userId
   * 그 자체이며, userId 가 없으면 Login 으로 redirect 한다.
   */
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import AdminTabs from "../components/AdminTabs.svelte";
  import StatusPill from "../components/StatusPill.svelte";
  // TASK-083: status filter chip 디자인을 canonical FilterChips 컴포넌트
  // 로 승격. AdminBuilds 와 같은 디자인 토큰 (`--shadow-glow`) 을 단일
  // source 로 공유 — 운영자가 두 페이지를 번갈아 봐도 같은 톤으로 직관.
  import FilterChips from "../components/FilterChips.svelte";
  // TASK-084: 비-admin user 의 deep link 진입 시 frontend 가드.
  import AdminAccessDenied from "../components/AdminAccessDenied.svelte";
  // TASK-077: RegisterRunnerModal — admin 이 신규 cluster / k8s pod /
  // EC2 instance 에서 runner 를 띄우기 전에, 그 runner 가 곧 들어온다는
  // 것을 admin UI 에 미리 등록할 수 있다. Pre-registration 된 runner
  // record 는 status=ACTIVE + firstSeenAt=now() + lastSeenAt=now() 로
  // placeholder 생성되며, 그 runner 가 실제 띄워져 첫 claim 을 보내면
  // 기존 self-register 가 counter / currentBuildId 만 갱신한다 (seamless
  // 통합). 같은 runnerId 로 두 번 호출 시 409.
  import RegisterRunnerModal from "../components/RegisterRunnerModal.svelte";
  import { userIdStore } from "../lib/session.js";
  import type {
    AdminRunner,
    AdminRunnerListResponse,
    RunnerStatus
  } from "../lib/api.js";
  import {
    deleteAdminRunner,
    listAdminRunners,
    patchAdminRunnerStatus
  } from "../lib/api.js";
  // TASK-084: ensureAdminAccess helper 가 adminAllowListStore 캐시 +
  // refresh 를 단일 source-of-truth 로 다룬다.
  import { ensureAdminAccess } from "../lib/admin-guard.js";

  let userId = $derived($userIdStore);
  // TASK-076: effective admin id = userId 그 자체.
  let effectiveAdminId = $derived(userId);

  // TASK-084: 비-admin user 의 deep link 진입 시 backend 호출 없이
  // frontend 에서 거부 → AdminAccessDenied 패널 노출.
  let accessDenied = $state<null | {
    reason: "NO_USER" | "FORBIDDEN" | "NOT_IN_ALLOW_LIST";
  }>(null);

  let runners = $state<AdminRunner[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busyId = $state<string | null>(null);
  let filter = $state<"ALL" | "ACTIVE" | "DISABLED">("ALL");
  // TASK-077: RegisterRunnerModal 의 open state. 부모가 토글 — modal
  // 안에서 submit 성공시 onSuccess() 로 refresh 트리거 + close. modal 안
  // 자체적으로 open=false fallback 도 갖고 있어 부모의 close 호출 없어도
  // 안정적으로 닫힌다.
  let registerModalOpen = $state(false);

  onMount(async () => {
    // TASK-076: 더 이상 /admin/login 으로 가지 않는다 — admin 진입점은
    // 일반 Login 과 동일하다.
    if (!effectiveAdminId) {
      push("/");
      return;
    }
    // TASK-084: backend 호출 전 frontend admin 가드 — 비-admin user 의
    // raw 403 envelope 대신 친절한 패널을 노출한다.
    const guard = await ensureAdminAccess(effectiveAdminId);
    if (!guard.isAdmin) {
      accessDenied = { reason: guard.reason };
      loading = false;
      return;
    }
    await refresh();
  });

  async function refresh() {
    if (!effectiveAdminId) return;
    loading = true;
    error = null;
    try {
      const result: AdminRunnerListResponse = await listAdminRunners(
        effectiveAdminId
      );
      runners = result.runners;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  // Client-side status filter — keeps the table scannable when the
  // registry grows. The Backend snapshot is always the full list so this
  // does not need to round-trip.
  const visible = $derived(
    filter === "ALL"
      ? runners
      : runners.filter((r) => r.status === filter)
  );

  function formatRelative(iso: string): string {
    const then = new Date(iso).getTime();
    const diffMs = Date.now() - then;
    const sec = Math.max(0, Math.round(diffMs / 1000));
    if (sec < 60) return `${sec}s ago`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.round(hr / 24);
    return `${day}d ago`;
  }

  async function toggleStatus(r: AdminRunner) {
    if (!effectiveAdminId) return;
    const next: RunnerStatus = r.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    if (!confirm(
      `${r.runnerId} 를 ${next} 로 토글할까요? (DISABLE 토글 시 다음 claim 부터 RUNNER_DISABLED reason 으로 거절)`
    )) {
      return;
    }
    busyId = r.runnerId;
    error = null;
    try {
      await patchAdminRunnerStatus(effectiveAdminId, r.runnerId, next);
      await refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busyId = null;
    }
  }

  async function remove(r: AdminRunner) {
    if (!effectiveAdminId) return;
    if (
      !confirm(
        `${r.runnerId} 를 영구 삭제할까요? 다음 claim 부터 self-register 로 다시 생깁니다 (idempotent).`
      )
    ) {
      return;
    }
    busyId = r.runnerId;
    error = null;
    try {
      await deleteAdminRunner(effectiveAdminId, r.runnerId);
      await refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busyId = null;
    }
  }
</script>

{#if accessDenied}
  <AdminAccessDenied userId={userId} reason={accessDenied.reason} />
{:else}
<section class="page">
  <AdminTabs />

  <header class="page-head">
    <div>
      <h1>Runner Registry</h1>
      <p class="muted">
        {runners.length} runner{runners.length === 1 ? "" : "s"} total ·
        {runners.filter((r) => r.status === "ACTIVE").length} active ·
        {runners.filter((r) => r.status === "DISABLED").length} disabled
      </p>
    </div>
    <div class="page-head-actions">
      <FilterChips
        options={["ALL", "ACTIVE", "DISABLED"]}
        selected={filter}
        onSelect={(v) => (filter = v as typeof filter)}
        ariaLabel="Status filter"
      />
      <!--
        TASK-077: "Register Runner" 버튼 — admin 이 신규 cluster / k8s pod
        / EC2 instance 에서 runner 를 띄우기 전에, 그 runner 가 곧 들어온다는
        것을 admin UI 에 미리 등록. 클릭시 modal 토글, modal 안에서 submit
        성공시 onSuccess → refresh() 호출 + modal close. 실패 (400/401/403/
        409) 시 modal 은 닫히지 않고 inline error 표시.
      -->
      <button
        type="button"
        class="btn-primary"
        onclick={() => (registerModalOpen = true)}
        data-testid="register-runner-open"
      >
        + Register Runner
      </button>
    </div>
  </header>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else if error}
    <p class="err" role="alert">{error}</p>
  {:else if runners.length === 0}
    <p class="muted">
      No runners registered yet. Runners self-register on their first <code
        >/builds/claim</code
      > call.
    </p>
  {:else if visible.length === 0}
    <p class="muted">No runners match the {filter} filter.</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Runner</th>
          <th>Status</th>
          <th class="r">Last seen</th>
          <th class="r">Claimed</th>
          <th class="r">Completed</th>
          <th>Current build</th>
          <th>Last error</th>
          <th class="r">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each visible as r (r.runnerId)}
          <tr class:disabled-row={r.status === "DISABLED"}>
            <td><code>{r.runnerId}</code></td>
            <td>
              <!-- TASK-072: inline `<span class="pill" class:active class:off>` 마크업을
                   canonical StatusPill 컴포넌트로 교체. RunnerStatus ("ACTIVE" /
                   "DISABLED") 가 StatusPill 의 colorFor 매핑에 추가되어 (TASK-072)
                   success / danger 색상으로 노출 — 운영자가 BuildsList (BuildSummary
                   success/failed) 와 AdminRunners (RunnerStatus ACTIVE/DISABLED) 를
                   번갈아 봐도 같은 색상 의미론으로 직관적. 디자인 토큰도 자동 follow. -->
              <StatusPill status={r.status} />
            </td>
            <td class="r muted">{formatRelative(r.lastSeenAt)}</td>
            <td class="r">{r.buildsClaimed}</td>
            <td class="r">{r.buildsCompleted}</td>
            <td>
              {#if r.currentBuildId}
                <code class="muted">{r.currentBuildId.slice(0, 8)}…</code>
              {:else}
                <span class="muted">—</span>
              {/if}
            </td>
            <td class="err-cell">
              {#if r.lastError}
                <span class="err-text" title={r.lastError}>{r.lastError}</span>
              {:else}
                <span class="muted">—</span>
              {/if}
            </td>
            <td class="r actions">
              <button
                type="button"
                class="btn-secondary"
                onclick={() => toggleStatus(r)}
                disabled={busyId === r.runnerId}
              >{r.status === "ACTIVE" ? "Disable" : "Reactivate"}</button>
              <button
                type="button"
                class="btn-danger"
                onclick={() => remove(r)}
                disabled={busyId === r.runnerId}
              >Delete</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <!--
    TASK-077: RegisterRunnerModal — admin 이 "+ Register Runner" 버튼으로
    토글. submit 성공시 onSuccess() 가 refresh() 를 호출해 runner list 를
    재요청 + modal close. 실패 (400/401/403/409) 시 modal 안 inline error
    가 표시되어 modal 은 닫히지 않음 — 운영자가 같은 context 에서 즉시 retry.
  -->
  <RegisterRunnerModal
    bind:open={registerModalOpen}
    onSuccess={async () => {
      await refresh();
    }}
  />
</section>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-xxl);
    animation: fadeIn var(--motion-duration-slow) var(--motion-easing-standard);
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
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
  .err {
    color: var(--color-accent-danger);
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
  thead th.r {
    text-align: right;
  }
  tbody td {
    padding: var(--space-md) var(--space-lg);
    border-top: 1px solid var(--color-border-subtle);
    font-size: var(--size-sm);
  }
  tbody td.r {
    text-align: right;
  }
  tbody tr.disabled-row td {
    opacity: 0.7;
  }
  tbody tr.disabled-row code {
    text-decoration: line-through;
  }
  tbody code {
    font-family: var(--font-mono);
    font-size: var(--size-xs);
  }
  /* TASK-070 (PR #23) 에서 `.btn-danger` / `.chip.active` 의 raw rgba 를
     canonical 디자인 토큰 기반 `color-mix` 로 정렬. tokens.css 의 light /
     dark 모드별 자동 follow. TASK-072 에서 `.pill` / `.pill.active` / `.pill.off`
     자체는 canonical StatusPill 컴포넌트로 승격하면서 제거 — runner row 의
     status cell 은 이제 `<StatusPill status={r.status}>` 가 디자인 토큰과 의미
     mapping 을 모두 가져간다 (colorFor ACTIVE → success / DISABLED → danger). */
  .err-cell {
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .err-text {
    color: var(--color-accent-danger);
    font-size: var(--size-xs);
  }
  .actions {
    display: flex;
    gap: var(--space-xs);
    justify-content: flex-end;
  }
  .btn-secondary,
  .btn-danger {
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    font-size: var(--size-xs);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    border: 1px solid var(--color-border-strong);
    background: var(--color-bg-surface-elevated);
    color: var(--color-text-secondary);
    transition: all var(--motion-duration-fast) var(--motion-easing-standard);
  }
  .btn-secondary:hover:not(:disabled) {
    color: var(--color-text-primary);
    background: var(--color-bg-canvas);
  }
  .btn-danger {
    background: color-mix(in srgb, var(--color-accent-danger) 8%, transparent);
    color: var(--color-accent-danger);
    border-color: color-mix(in srgb, var(--color-accent-danger) 32%, transparent);
  }
  .btn-danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-accent-danger) 16%, transparent);
  }
  .btn-secondary:disabled,
  .btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-danger:hover:not(:disabled),
  .btn-secondary:hover:not(:disabled) {
    transform: translateY(-1px);
  }
</style>
