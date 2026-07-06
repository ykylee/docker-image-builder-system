<script lang="ts">
  /**
   * AdminTabs — admin 섹션 간 탭 네비게이션 (TASK-077).
   *
   * Header 가 admin 진입점을 단일 링크("🛡 Admin")로 정리한 뒤,
   * 각 admin 페이지(`/admin/builds` / `/admin/users` / `/admin/admins` /
   * `/admin/runners`) 의 상단에 공통 탭 바를 노출한다. 사용자가
   * 빌드 모니터의 다른 영역 (BuildsList / BuildDetail) 에 머무는 동안에는
   * 이 컴포넌트가 마운트되지 않으므로 admin 영역 안에서만 보인다.
   *
   * active 표시는 svelte-spa-router 의 `$location` store 를 구독해 현재
   * 경로와 tab 의 `href` 를 직접 비교한다. `use:link` 가 자동으로 부여하
   * 는 `aria-current="page"` 도 함께 적용된다. 시각적 강조는 디자인
   * 토큰 기반 primary 배경 pill (`--color-accent-primary`) 으로 한다.
   *
   * 라우트 변경 시 데이터 fetching 은 각 페이지의 onMount 가 다시
   * 실행되므로 탭 전환 시 항상 최신 snapshot 으로 새로 로드된다.
   */
  import { link, location } from "svelte-spa-router";

  interface Tab {
    href: string;
    label: string;
  }

  const tabs: ReadonlyArray<Tab> = [
    { href: "/admin/builds", label: "Builds" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/admins", label: "Admins" },
    { href: "/admin/runners", label: "Runners" }
  ];

  let currentPath = $derived($location);
</script>

<nav class="admin-tabs" aria-label="Admin sections">
  {#each tabs as tab (tab.href)}
    <a
      use:link
      href={tab.href}
      class="admin-tab"
      class:active={currentPath === tab.href}
      aria-current={currentPath === tab.href ? "page" : undefined}
    >{tab.label}</a>
  {/each}
</nav>

<style>
  .admin-tabs {
    display: inline-flex;
    gap: var(--space-xs);
    padding: var(--space-xs);
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-card);
  }

  .admin-tab {
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-pill);
    color: var(--color-text-secondary);
    font-size: var(--size-sm);
    font-weight: var(--weight-medium);
    transition: color var(--motion-duration-fast) var(--motion-easing-standard),
                background var(--motion-duration-fast) var(--motion-easing-standard);
  }

  .admin-tab:hover {
    color: var(--color-text-primary);
    text-decoration: none;
  }

  .admin-tab.active {
    background: var(--color-accent-primary);
    color: white;
    /* primary 배경 위 살짝 띄우는 glow — 디자인 토큰으로 light / dark
       모드별 자동 follow. raw rgba 사용 안 함. */
    box-shadow: var(--shadow-glow);
  }
</style>
