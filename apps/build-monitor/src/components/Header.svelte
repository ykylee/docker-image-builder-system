<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import ThemeToggle from "./ThemeToggle.svelte";
  import { userIdStore, adminIdStore } from "../lib/session.js";

  // session.ts 의 writable store 가 localStorage 와 양방향 동기화를
  // 담당한다 (Bug 1: 로그인 직후 Header 가 즉시 갱신되도록). 컴포넌트
  // state 를 따로 두지 않고 store 값을 직접 구독한다.
  let userId = $derived($userIdStore);
  let adminId = $derived($adminIdStore);

  function logout() {
    userIdStore.set(null);
    push("/");
  }

  function adminLogout() {
    // Admin session is independent from the user session so logging out
    // of the admin UI does not sign the user out of the build monitor.
    adminIdStore.set(null);
    push("/");
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
      {#if adminId}
        <div class="divider"></div>
        <span class="admin-id mono" title="Admin signed in">🛡 @{adminId}</span>
        <a use:link href="/admin/builds">Admin · Builds</a>
        <a use:link href="/admin/users">Admin · Users</a>
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
