<script lang="ts">
  /**
   * AdminAccessDenied — TASK-084 (deep link UX).
   *
   * 비-admin user 가 `/admin/*` deep link 를 직접 진입했을 때 노출되는
   * 친절한 권한 없음 패널. AdminBuilds / AdminUsers / AdminAdmins /
   * AdminRunners 페이지의 onMount 첫 단계에서 backend 호출 전 가드로
   * 사용한다 (apps/build-monitor/src/lib/admin-guard.ts 의 ensureAdminAccess
   * helper 와 짝꿍).
   *
   * 디자인 토큰 정합:
   *   - Admin 페이지와 동일한 `<header class="page-head">` + fadeIn 패턴
   *     으로 시각적 톤 통일 (TASK-083 page wrapper 와 일관).
   *   - 카드 디자인은 Login.svelte 의 `.card` 패턴 (surface + border + shadow)
   *     을 차용하되, danger accent 텍스트 + Shield 아이콘으로 의미 강조.
   *
   * 액션:
   *   - "Back to Builds": userId 는 유지한 채 일반 빌드 모니터로 이동.
   *     비-admin 사용자가 admin 영역을 잘못 진입한 직후의 자연스러운
   *     복귀 경로.
   *   - "Switch user": userId 를 clear 하고 Login 페이지로 redirect. 같은
   *     PC 를 다른 user 가 공유하거나 userId 를 잘못 입력한 경우의 escape
   *     hatch.
   *
   * reason 별 메시지:
   *   - "NO_USER": helper 가 NO_USER 로 거부 — 사실상 페이지 도달 불가
   *     이지만, 안전을 위해 표시.
   *   - "FORBIDDEN": backend 가 명시적으로 caller 의 admin 미허용을
   *     확인 (401/403). 가장 흔한 deep link 케이스.
   *   - "NOT_IN_ALLOW_LIST": backend 가 allow-list 를 알려줬지만 caller
   *     가 거기 없음. 운영자가 allow-list 를 갱신한 직후 발생할 수 있는
   *     stale session 케이스.
   */
  import { link, push } from "svelte-spa-router";
  import { userIdStore } from "../lib/session.js";

  type DenyReason = "NO_USER" | "FORBIDDEN" | "NOT_IN_ALLOW_LIST";

  interface Props {
    userId: string | null;
    reason: DenyReason;
  }

  let { userId, reason }: Props = $props();

  // reason 별 사용자 메시지. 운영자가 보고 어느 경로로 거부됐는지
  // 직관할 수 있도록 단순 string.
  const headline = $derived(
    reason === "NO_USER"
      ? "Sign in required"
      : reason === "FORBIDDEN"
        ? "Admin access required"
        : "Admin access required"
  );

  const bodyMessage = $derived.by(() => {
    if (reason === "NO_USER") {
      return "Please sign in to view this page.";
    }
    const handle = userId ? `@${userId}` : "Your account";
    if (reason === "FORBIDDEN") {
      return `${handle} is not authorized to view admin sections.`;
    }
    // NOT_IN_ALLOW_LIST: 백엔드 allow-list 응답을 받았지만 caller 가
    // 목록에서 빠져 있는 케이스 — 운영자가 권한을 회수했거나 userId 를
    // 잘못 입력했을 수 있다.
    return `${handle} is not on the current admin allow-list. Ask an existing admin to add you, or sign in with a different user id.`;
  });

  function switchUser() {
    userIdStore.set(null);
    push("/");
  }
</script>

<section class="page">
  <header class="page-head">
    <div>
      <h1>🔒 {headline}</h1>
      <p class="muted">{bodyMessage}</p>
    </div>
  </header>

  <div class="card">
    <p class="card-body">
      {#if userId}
        You are currently signed in as <code class="mono">@{userId}</code>.
      {:else}
        You are not signed in.
      {/if}
      <br />
      Admin sections are reserved for users in the Build Server's
      <code>ADMIN_IDS</code> allow-list.
    </p>

    <div class="actions">
      <a use:link href="/builds" class="btn-primary" data-testid="admin-denied-go-builds">
        Back to Builds
      </a>
      <button
        type="button"
        class="btn-secondary"
        onclick={switchUser}
        data-testid="admin-denied-switch-user"
      >
        Switch user
      </button>
    </div>
  </div>
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
    gap: var(--space-lg);
    flex-wrap: wrap;
  }
  h1 {
    margin: 0;
    font-size: var(--size-xxl);
    font-weight: var(--weight-semibold);
    letter-spacing: -0.02em;
    color: var(--color-accent-danger);
  }
  .muted {
    color: var(--color-text-muted);
    margin: 4px 0 0;
    font-size: var(--size-sm);
  }
  .card {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-modal);
    padding: var(--space-xxl);
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
    max-width: 640px;
  }
  .card-body {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--size-md);
    line-height: 1.6;
  }
  .card-body code {
    background: var(--color-bg-canvas);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    padding: 0 var(--space-xs);
    font-size: 0.95em;
  }
  .actions {
    display: flex;
    gap: var(--space-md);
    flex-wrap: wrap;
  }
  .btn-primary,
  .btn-secondary {
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-md);
    font-size: var(--size-sm);
    font-weight: var(--weight-semibold);
    cursor: pointer;
    transition: all var(--motion-duration-fast) var(--motion-easing-standard);
    border: 1px solid transparent;
  }
  .btn-primary {
    background: var(--color-accent-primary);
    color: white;
  }
  .btn-primary:hover {
    background: var(--color-accent-primary-hover);
    box-shadow: var(--shadow-glow);
    text-decoration: none;
  }
  .btn-secondary {
    background: var(--color-bg-surface);
    color: var(--color-text-secondary);
    border-color: var(--color-border-strong);
  }
  .btn-secondary:hover {
    color: var(--color-text-primary);
    background: var(--color-bg-surface-elevated);
  }
</style>
