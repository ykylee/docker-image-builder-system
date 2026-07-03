<script lang="ts">
  import { link, push, location } from "svelte-spa-router";
  import ThemeToggle from "./ThemeToggle.svelte";

  let userId = $state<string | null>(null);

  // We check location to reactivity update userId when route changes
  $effect(() => {
    if ($location) {
      userId = localStorage.getItem("userId");
    }
  });

  function logout() {
    localStorage.removeItem("userId");
    userId = null;
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
