<script lang="ts">
  import { onMount } from "svelte";
  import { link, push } from "svelte-spa-router";
  import ThemeToggle from "./ThemeToggle.svelte";
  import { userIdStore } from "../lib/session.js";
  import { adminAllowListStore } from "../lib/admin-store.js";

  // session.ts 의 writable store 가 localStorage 와 양방향 동기화를
  // 담당한다 (Bug 1: 로그인 직후 Header 가 즉시 갱신되도록). 컴포넌트
  // state 를 따로 두지 않고 store 값을 직접 구독한다.
  //
  // TASK-076: 별도 adminId store 는 제거됐다. admin 권한은 userId 가
  // admin allow-list 에 속해 있으면 자동 부여되며, userId 만으로 admin
  // session 을 암묵적으로 잡는다 (별도 admin login / logout 단계 없음).
  let userId = $derived($userIdStore);

  // TASK-048: admin allow-list 캐시. userId 가 admin list 에 포함되어
  // 있으면 admin 메뉴를 자동으로 노출한다 (별도 AdminLogin 단계 없이).
  // 빈 배열은 "아직 fetch 안 됨" 또는 "fetch 실패" 상태이며, 이 경우
  // auto-enable 도 false 로 두어 비-admin 사용자가 admin 메뉴를 보지
  // 못하도록 한다.
  let adminAllowList = $derived($adminAllowListStore);

  // userId 가 adminAllowList 에 포함되면 admin 으로 auto-enable. 단,
  // userId 가 없거나 allowList 가 비어있으면 false.
  let autoAdminEnabled = $derived(
    !!userId && adminAllowList.length > 0 && adminAllowList.includes(userId)
  );

  // 표시할 admin id = userId 그 자체 (TASK-076). 별도 admin session 이
  // 없으므로 logout 하면 userIdStore 가 null 이 되는 순간 admin 메뉴도
  // 자연스럽게 사라진다.
  let effectiveAdminId = $derived(autoAdminEnabled ? userId : null);

  function logout() {
    // userId 가 admin allow-list 에 있었더라도, logout 하면 더 이상
    // admin 메뉴는 노출되지 않는다 — userId null 이 되면
    // autoAdminEnabled 도 false 가 되므로 admin 메뉴가 자연스럽게 사라진다.
    userIdStore.set(null);
    push("/");
  }

  // 부팅 시 userId 가 있으면 admin allow-list 를 prefetch 한다. userId 가
  // admin list 에 속해 있으면 즉시 admin 메뉴가 노출되고, 아니면 admin
  // 메뉴는 표시되지 않는다. 실패 시 (offline / 비-401 응답) 캐시는 빈
  // 배열로 남고 admin 메뉴는 비활성화된다 — 이전에는 이때 `/admin/login`
  // 으로 fallback 했지만 TASK-076 에서는 그 entry 가 사라졌으므로
  // 단순히 admin 메뉴만 닫힌다.
  onMount(async () => {
    if (userId && adminAllowList.length === 0) {
      try {
        await adminAllowListStore.refresh(userId);
      } catch {
        // intentional: stale cache; admin menu stays hidden until next
        // successful refresh (e.g. next page navigation trigger).
      }
    }
  });
</script>

<header class="hdr">
  <div class="hdr-inner">
    <a use:link href="/" class="brand">
      <div class="logo-wrapper">
        <span class="logo" aria-hidden="true">⬢</span>
      </div>
      <span class="title">Build Monitor</span>
    </a>
    <nav>
      {#if userId}
        <span class="user-id mono">@{userId}</span>
        <a use:link href="/builds">Builds</a>
        <!-- TASK-079 (skill 측 build request UI): 일반 인증 사용자 (admin
             여부 무관) 가 POST /builds payload 를 직접 작성해 lifecycle
             을 시험할 수 있는 진입점. Header 의 첫 nav 로 노출하여
             로그인 직후 가장 빠르게 접근 가능하도록 함. -->
        <a use:link href="/build-request">New Build</a>
        <button class="logout-btn" onclick={logout}>Logout</button>
      {/if}
      {#if effectiveAdminId}
        <div class="divider"></div>
        <span class="admin-id mono" title="Admin session active">🛡 @{effectiveAdminId}</span>
        <!-- TASK-077: admin 진입점은 단일 링크. 각 admin 섹션 (Builds /
             Users / Admins / Runners) 사이의 이동은 페이지 상단
             <AdminTabs /> 가 담당한다. -->
        <a use:link href="/admin/builds">Admin</a>
      {/if}
      <div class="divider"></div>
      <!-- API Console: SPA 안에서 Swagger UI 를 임베드한 페이지.
           build 요청을 시험하면서 동시에 OpenAPI contract 를 확인할 수 있게
           함. 외부 `/docs/` 로 새 탭 열기보다 SPA 흐름 유지가 자연스러움. -->
      <a use:link href="/api-console" data-testid="hdr-api-console">API Console</a>
      <!-- OpenAPI: raw JSON spec — 다운로드 / 외부 검증 도구 입력용. -->
      <a href="/openapi.json" target="_blank" rel="noopener" data-testid="hdr-openapi">OpenAPI</a>
      <!-- Docs: build-server Swagger UI 를 외부 새 탭에서 열기. -->
      <a href="/docs/" target="_blank" rel="noopener" data-testid="hdr-docs">Docs</a>
      <div class="divider"></div>
      <ThemeToggle />
    </nav>
  </div>
</header>

<style>
  .hdr {
    position: sticky;
    top: 0;
    z-index: var(--z-header);
    background: var(--glass-bg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--glass-border);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    transition: background-color var(--motion-duration-base) var(--motion-easing-standard);
  }
  .hdr-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--space-xl);
    height: 64px;
    max-width: 1440px;
    margin: 0 auto;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--color-text-primary);
    font-weight: var(--weight-semibold);
    font-size: var(--size-lg);
    letter-spacing: -0.01em;
  }
  .brand:hover { text-decoration: none; }
  .logo-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    background: linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-info));
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
  }
  .logo {
    color: white;
    font-size: var(--size-lg);
    line-height: 1;
  }
  nav {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }
  nav a {
    color: var(--color-text-secondary);
    font-weight: var(--weight-medium);
    font-size: var(--size-sm);
    transition: color var(--motion-duration-fast) var(--motion-easing-standard);
  }
  nav a:hover {
    color: var(--color-text-primary);
    text-decoration: none;
  }
  .user-id {
    color: var(--color-text-primary);
    font-size: var(--size-sm);
    font-weight: var(--weight-semibold);
    background: var(--color-bg-surface-elevated);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-border-subtle);
  }
  .logout-btn {
    color: var(--color-accent-danger);
    font-size: var(--size-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    transition: color var(--motion-duration-fast) var(--motion-easing-standard);
  }
  .logout-btn:hover {
    color: var(--color-accent-danger);
    text-decoration: underline;
  }
  .divider {
    width: 1px;
    height: 24px;
    background: var(--color-border-subtle);
    margin: 0 var(--space-xs);
  }
</style>
