<script lang="ts">
  // TASK-100 (M4.5 Group F) — App.svelte router 단순화.
  //
  // 본 파일은 이전 frontend rewrite 시리즈에서 React 측이 primary SPA 가
  // 되기 전 까지 모든 라우트의 정의를 담당했음. 본 TASK 시점에는:
  //
  //   - /              → React Login (TASK-089)
  //   - /builds        → React BuildsList (TASK-090)
  //   - /builds/:id    → React BuildDetail (TASK-091) + Build Server 가
  //                      React dist 만 mount 하므로 Svelte SPA 진입 자체 불가
  //   - /build-request → React BuildRequest (TASK-099)
  //   - /api-console   → React ApiConsole (TASK-099)
  //   - /admin/*       → React Admin 4종 (TASK-098)
  //
  // Build Server 의 `mountBuildMonitorDist` 가 React dist 만 mount 하고
  // Svelte 측 build 산출물은 더 이상 정적 서빙되지 않음 (TASK-094 최종 단계).
  // 따라서 본 Svelte App.svelte 의 routes 정의는 운영 환경에서 unreachable —
  // TASK-101 Group G 에서 Svelte scaffold 일괄 정리 시 본 파일 자체가
  // 삭제될 예정.
  //
  // TASK-100 의 본질: 본 파일을 404 placeholder 1개 routes 만 남기고
  // 단순화. 향후 단위 테스트 환경 (svelte-check 가 Svelte 측 코드 parse)
  // 에서 svelte-spa-router 가 정상 동작하도록 최소 routes 정의 유지.

  import Router from "svelte-spa-router";
  import Header from "./components/Header.svelte";
  import NotFound from "./routes/NotFound.svelte";

  const routes = {
    "*": NotFound
  };
</script>

<Header />
<main>
  <Router {routes} />
</main>

<style>
  main {
    max-width: 1440px;
    margin: 0 auto;
    padding: var(--space-lg) var(--space-xl);
  }
</style>
