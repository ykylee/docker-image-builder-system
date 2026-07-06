<script lang="ts">
  import { link } from "svelte-spa-router";

  // TASK-079 (skill 측 build request UI): Swagger UI 를 build-monitor
  // SPA 안에서 임베드한 페이지. Header 의 "Docs" 링크는 외부 `/docs/` 로
  // 새 탭에서 열리지만, 사용자가 SPA 컨텍스트 안에서 OpenAPI contract 를
  // 확인하며 동시에 build 요청을 시험해볼 수 있도록 inline rendering.
  //
  // 빌드 서버는 `/docs/` (trailing slash) 에서 Swagger UI HTML 을 서빙
  // 하고, SPA fallback 은 dist/index.html 로 라우팅되므로 iframe 의 src 가
  // `/docs/` 로 잡히면 정확히 Swagger UI 가 iframe 안에서만 렌더링된다.
  // build-monitor 다른 nav 와 무관한 별도 origin iframe 안에서의 동작이므로
  // header / nav 와 격리되어 layout 깨짐 없음.

  // iframe URL. trailing slash 가 빠지면 fastify redirect 가 발생하므로
  // 명시적으로 포함.
  let swaggerUrl = "/docs/";

  // iframe load 상태. network failure 또는 backend unreachable 시 에러
  // 메시지로 fallback.
  let iframeError = $state<string | null>(null);

  function onIframeLoad() {
    iframeError = null;
  }
  function onIframeError() {
    iframeError = "Failed to load Swagger UI. Is the build server running?";
  }

  // iframe 재로드를 위한 key. 사용자가 refresh 누를 때마다 새 src 캐시 회피.
  let reloadKey = $state(0);
  function refreshIframe() {
    reloadKey += 1;
    iframeError = null;
  }

  // openapi.json 도 함께 제공 — raw contract 확인 가능.
  function openOpenApiSpec() {
    window.open("/openapi.json", "_blank", "noopener,noreferrer");
  }
</script>

<section class="page">
  <header class="page-head">
    <div>
      <h1>API Console</h1>
      <!-- TASK-079 셀프 리뷰 D-5 보완: "좌측 / 우측 navigation" 설명이
           부정확. 본 페이지에는 iframe 만 있으며, 그 iframe 안의 Swagger UI
           가 좌측 endpoint list + 우측 detail panel 인 layout 임을 명확히. -->
      <p class="muted">
        Build Server 의 OpenAPI contract 를 Swagger UI 로 렌더링합니다.
        iframe 안의 Swagger UI 의 <strong>좌측 endpoint list</strong> 에서
        endpoint 를 선택하고, <strong>우측 detail panel</strong> 에서
        <strong>Try it out</strong> 으로 직접 호출해볼 수 있습니다.
      </p>
    </div>
    <div class="actions">
      <button type="button" class="btn-secondary" onclick={refreshIframe} data-testid="api-console-refresh">
        ↻ Refresh
      </button>
      <button type="button" class="btn-secondary" onclick={openOpenApiSpec} data-testid="api-console-raw">
        Raw OpenAPI JSON ↗
      </button>
      <a use:link href="/build-request" class="btn-primary" data-testid="api-console-go-build">
        Go to Build Request →
      </a>
    </div>
  </header>

  <div class="frame-wrap" data-testid="api-console-frame">
    {#key reloadKey}
      <iframe
        src={swaggerUrl}
        title="Build Server Swagger UI"
        onload={onIframeLoad}
        onerror={onIframeError}
      ></iframe>
    {/key}
    {#if iframeError}
      <div class="overlay error" role="alert">
        <strong>{iframeError}</strong>
        <p>백엔드 (port 3000) 가 동작 중인지 확인하세요.</p>
        <button type="button" class="btn-secondary" onclick={refreshIframe}>Retry</button>
      </div>
    {/if}
  </div>

  <details class="hint-block">
    <summary>About this view</summary>
    <p>
      Swagger UI 는 build server 가 직접 서빙합니다 (<code>{swaggerUrl}</code>).
      본 페이지에서는 같은 SPA 안에서 navigation 흐름을 깨지 않도록 iframe 으로
      임베드합니다. 네트워크 오류 또는 backend down 시 iframe 이 빈 화면으로
      남을 수 있어, 그 경우 "Refresh" 버튼 또는 우측 상단 "Raw OpenAPI JSON"
      으로 fallback.
    </p>
    <p>
      본 화면과 함께 <code>/build-request</code> 페이지에서 BuildRequest payload 를
      직접 제출하면서 본 API Console 의 응답 형식을 확인할 수 있습니다.
    </p>
  </details>
</section>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    animation: fadeIn var(--motion-duration-slow) var(--motion-easing-standard);
    height: calc(100vh - 64px - var(--space-xl) * 2);
    /* header 가 sticky 라서 viewport 에서 header 높이를 뺀 만큼 frame 이 차지. */
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .page-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-lg);
    flex-wrap: wrap;
  }
  .page-head h1 {
    margin: 0;
    font-size: var(--size-xxl);
    font-weight: var(--weight-semibold);
    letter-spacing: -0.02em;
    background: linear-gradient(90deg, var(--color-text-primary), var(--color-text-muted));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .page-head .muted {
    color: var(--color-text-muted);
    margin-top: var(--space-xs);
    max-width: 60ch;
    line-height: var(--motion-duration-base);
  }
  .muted { color: var(--color-text-muted); }

  .actions {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
    align-items: center;
  }
  .btn-primary {
    padding: var(--space-sm) var(--space-xl);
    border-radius: var(--radius-md);
    background: var(--color-accent-primary);
    color: white;
    font-weight: var(--weight-semibold);
    font-size: var(--size-sm);
    border: none;
    cursor: pointer;
    transition: all var(--motion-duration-fast) var(--motion-easing-standard);
    /* raw rgba 잔재 정리 (TASK-083) — 동일 primary click surface 의
       일관성 위해 디자인 토큰 `--shadow-glow` 사용. dark / light 모드별 자동
       follow. */
    box-shadow: var(--shadow-glow);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }
  .btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-glow);
  }
  .btn-secondary {
    padding: var(--space-sm) var(--space-xl);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text-secondary);
    font-weight: var(--weight-medium);
    font-size: var(--size-sm);
    border: 1px solid var(--color-border-subtle);
    cursor: pointer;
    transition: all var(--motion-duration-fast) var(--motion-easing-standard);
  }
  .btn-secondary:hover {
    color: var(--color-text-primary);
    border-color: var(--color-text-secondary);
  }

  .frame-wrap {
    position: relative;
    flex: 1 1 auto;
    min-height: 480px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--color-border-subtle);
    box-shadow: var(--shadow-card);
    background: white;
  }
  iframe {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }
  .overlay.error {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-surface);
    text-align: center;
    padding: var(--space-lg);
    gap: var(--space-md);
  }
  .overlay strong {
    color: var(--color-accent-danger);
    font-size: var(--size-lg);
  }
  .overlay p { color: var(--color-text-muted); }

  .hint-block {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-md);
  }
  .hint-block summary {
    cursor: pointer;
    font-size: var(--size-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text-secondary);
  }
  .hint-block p {
    margin: var(--space-sm) 0 0;
    color: var(--color-text-muted);
    font-size: var(--size-sm);
    line-height: var(--motion-duration-base);
  }
  .hint-block code {
    background: var(--color-bg-surface-elevated);
    padding: 0 4px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono, monospace);
    font-size: var(--size-xs);
  }
</style>