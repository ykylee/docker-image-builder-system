<script lang="ts">
  import { onMount } from "svelte";
  import { link, push } from "svelte-spa-router";
  import ThemeToggle from "./ThemeToggle.svelte";
  import { userIdStore, adminIdStore } from "../lib/session.js";
  import { adminAllowListStore } from "../lib/admin-store.js";

  // session.ts 의 writable store 가 localStorage 와 양방향 동기화를
  // 담당한다 (Bug 1: 로그인 직후 Header 가 즉시 갱신되도록). 컴포넌트
  // state 를 따로 두지 않고 store 값을 직접 구독한다.
  let userId = $derived($userIdStore);
  let adminId = $derived($adminIdStore);

  // TASK-048: admin allow-list 캐시. userId 가 admin list 에 포함되어
  // 있으면 admin 메뉴를 자동으로 노출한다 (별도 AdminLogin 단계 없이).
  // 빈 배열은 "아직 fetch 안 됨" 또는 "fetch 실패" 상태이며, 이 경우
  // auto-enable 도 false 로 두어 명시적 /admin/login 흐름을 유지한다.
  let adminAllowList = $derived($adminAllowListStore);

  // userId 가 adminAllowList 에 포함되면 admin 으로 auto-enable. 단,
  // userId 가 없거나 allowList 가 비어있으면 false.
  let autoAdminEnabled = $derived(
    !!userId && adminAllowList.length > 0 && adminAllowList.includes(userId)
  );

  // 표시할 admin id 결정. 명시적 adminId (AdminLogin 통과) 가 있으면
  // 그걸 우선하고, 없으면 auto-enable 인 경우 userId 로 admin session
  // 을 암묵적으로 잡는다. logout 시 userIdStore 가 null 이 되면
  // autoAdminEnabled 도 false 가 되어 admin 메뉴가 자연스럽게 사라진다.
  let effectiveAdminId = $derived(adminId ?? (autoAdminEnabled ? userId : null));

  function logout() {
    userIdStore.set(null);
    // userId 가 admin allow-list 에 있었더라도, logout 하면 더 이상
    // admin 메뉴는 노출되지 않는다. admin session 도 같이 정리.
    adminIdStore.set(null);
    push("/");
  }

  // 부팅 시 userId 가 있으면 admin allow-list 를 prefetch 한다. userId 가
  // admin list 에 속해 있으면 즉시 admin 메뉴가 노출되고, 아니면 AdminLogin
  // 흐름이 그대로 유지된다. 실패 시 (offline / 비-401 응답) 캐시는 빈 배열
  // 로 남고 explicit /admin/login 으로 fallback 가능.
  onMount(async () => {
    if (userId && adminAllowList.length === 0) {
      try {
        await adminAllowListStore.refresh(userId);
      } catch {
        // intentional: stale cache; user can still visit /admin/login.
      }
    }
  });

  function adminLogout() {
    // Admin session is independent from the user session so logging out
    // of the admin UI does not sign the user out of the build monitor.
    // 단, auto-enable 인 경우 (userId 가 admin 인 상태) 에는 user
    // session 은 유지하되, admin 메뉴만 숨긴다.
    adminIdStore.set(null);
    if (!autoAdminEnabled) {
      push("/");
    }
  }
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
        <button class="logout-btn" onclick={logout}>Logout</button>
      {/if}
      {#if effectiveAdminId}
        <div class="divider"></div>
        <span class="admin-id mono" title="Admin session active">🛡 @{effectiveAdminId}</span>
        <a use:link href="/admin/builds">Admin · Builds</a>
        <a use:link href="/admin/users">Admin · Users</a>
        <a use:link href="/admin/admins">Admin · Admins</a>
        <a use:link href="/admin/runners">Admin · Runners</a>
        <button class="logout-btn" onclick={adminLogout}>Admin Logout</button>
      {:else}
        <a use:link href="/admin/login" class="admin-link">Admin</a>
      {/if}
      <div class="divider"></div>
      <a href="/openapi.json" target="_blank" rel="noopener">API</a>
      <a href="/docs" target="_blank" rel="noopener">Docs</a>
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
