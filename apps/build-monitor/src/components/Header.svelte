<script lang="ts">
  import { link } from "svelte-spa-router";
</script>

<header class="hdr">
  <a use:link href="/" class="brand">
    <span class="logo" aria-hidden="true">⬢</span>
    <span class="title">Build Monitor</span>
  </a>
  <nav>
    <a use:link href="/builds">Builds</a>
    <a href="/openapi.json" target="_blank" rel="noopener">API</a>
    <a href="/docs" target="_blank" rel="noopener">Docs</a>
  </nav>
</header>

<style>
  .hdr {
    position: sticky;
    top: 0;
    z-index: var(--z-header);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--space-xl);
    height: 56px;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .brand { display: inline-flex; align-items: center; gap: var(--space-sm); color: var(--color-text-primary); font-weight: var(--weight-semibold); }
  .brand:hover { text-decoration: none; }
  .logo { color: var(--color-accent-primary); font-size: var(--size-xl); }
  nav { display: inline-flex; gap: var(--space-lg); }
</style>
