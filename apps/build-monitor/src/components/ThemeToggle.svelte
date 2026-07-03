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
    // onMount 가 applyTheme 을 호출하지만, 첫 마운트 시점에 isLight 가
    // 이미 true/false 로 결정된 후 라 style.colorScheme 도 같이 set.
    // (applyTheme 안에서 set 하지만, isLight 가 false 인 경우 setAttribute
    // 가 호출되지 않을 가능성 — onMount 끝에서 명시 보강.)
    if (!isLight) {
      document.documentElement.style.colorScheme = "dark";
    }
  });

  function toggle() {
    isLight = !isLight;
    applyTheme(isLight);
  }

  function applyTheme(light: boolean) {
    if (light) {
      document.documentElement.setAttribute("data-theme", "light");
      // TASK-046: native form 컨트롤 (input, select, scrollbar) 도
      // light 모드에 맞춤. theme.css 의 :root[data-theme="light"] selector
      // 가 css-side 에서 set 하지만, 일부 환경 (jsdom) 에서 computed
      // style 검증이 필요할 때를 위해 js-side 에서도 명시.
      document.documentElement.style.colorScheme = "light";
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
      document.documentElement.style.colorScheme = "dark";
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
