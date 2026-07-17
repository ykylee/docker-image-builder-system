<script lang="ts">
  /**
   * BuildDetailRedirect — Svelte SPA 의 `/builds/:buildId` 진입 시 React
   * BuildDetail (`/builds/<id>` 가 React SPA 안에서 처리됨) 로 즉시
   * redirect. TASK-094 의 Svelte 정리 — BuildDetail.svelte / PhaseTimeline
   * / LogStream 을 React 로 마이그레이션 완료 후 Svelte 측 stub.
   *
   * Build Server 의 SPA fallback (TASK-093 의 `mountBuildMonitorDist`) 이
   * React dist-react/ 의 index.html 을 응답하므로 React `useParams` 가
   * 그대로 `:buildId` 를 잡는다. 본 component 는 그 진입까지의 bridge.
   *
   * 동일 localStorage userId 가 양쪽 SPA 의 session 으로 동작 (TASK-089
   * follow-up 의 useUserId cross-tab dispatch 와 정합).
   */
  import { onMount } from "svelte";

  let buildId = "";

  onMount(() => {
    // URL 에서 buildId 추출 — svelte-spa-router 의 params 객체가 SSR-safe 가
    // 아니므로 window.location.pathname 에서 직접 파싱.
    const m = window.location.pathname.match(/^\/builds\/([^/?#]+)/);
    buildId = m?.[1] ?? "";
    // React SPA 의 `/builds/<id>` 가 React BuildDetail 을 mount. 동일 path
    // 이므로 location.assign 으로 React 측에서 처리하도록 full reload.
    if (buildId) {
      window.location.assign(`/builds/${buildId}`);
    }
  });
</script>

<section class="detail">
  <p class="muted">Redirecting to React BuildDetail…</p>
</section>

<style>
  .detail {
    padding: var(--space-xxl, 32px);
    color: var(--color-text-primary);
    font-family: var(--font-family-sans, system-ui, sans-serif);
  }
  .muted {
    color: var(--color-text-muted);
    font-size: var(--size-sm, 13px);
    margin: 0;
  }
</style>
