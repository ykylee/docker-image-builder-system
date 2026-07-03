<script lang="ts">
  import { onMount } from "svelte";

  let isLight = $state(false);

  onMount(() => {
    // Check local storage or system preference
    const stored = localStorage.getItem("theme");
    if (stored === "light") {
      isLight = true;
    } else if (!stored && window.matchMedia("(prefers-color-scheme: light)").matches) {
      isLight = true;
    }
    applyTheme(isLight);
  });

  function toggle() {
    isLight = !isLight;
    applyTheme(isLight);
  }

  function applyTheme(light: boolean) {
    if (light) {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "dark");
    }
  }
</script>

<button class="theme-btn" onclick={toggle} aria-label="Toggle theme">
  {#if isLight}
    <!-- Moon icon for switching to dark -->
    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    </svg>
  {:else}
    <!-- Sun icon for switching to light -->
    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    </svg>
  {/if}
</button>

<style>
  .theme-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-pill);
    color: var(--color-text-secondary);
    background: transparent;
    transition: all var(--motion-duration-fast) var(--motion-easing-standard);
  }
  .theme-btn:hover {
    background: var(--color-bg-surface-elevated);
    color: var(--color-text-primary);
    transform: scale(1.05);
  }
</style>
