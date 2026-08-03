// API Console — Scalar API Reference iframe 임베드.
//
// Svelte src/routes/ApiConsole.svelte 와 1:1 정합. Build Server 의 `/docs/`
// (trailing slash) 가 Scalar API Reference HTML 을 서빙하고, React 측 SPA 의
// `/api-console` 라우트가 iframe 으로 임베드. SPA fallback (`/*` → React
// index.html) 와 격리되어 iframe 내부 layout 이 깨지지 않음.
//
// build-monitor 의 다른 nav 와 무관한 별도 origin iframe 안에서의 동작이므로
// header / nav 와 격리되어 layout 깨짐 없음.

import { useState } from "react";
import type { ReactElement } from "react";
import { Link } from "react-router-dom";

import "./ApiConsole.css";

// iframe URL. trailing slash 가 빠지면 fastify redirect 가 발생하므로
// 명시적으로 포함 (Svelte ApiConsole.svelte 와 동일).
const API_DOCS_URL = "/docs/";

export function ApiConsole(): ReactElement {
  const [iframeError, setIframeError] = useState<string | null>(null);
  // iframe 재로드를 위한 key. 사용자가 refresh 누를 때마다 새 src 캐시 회피.
  const [reloadKey, setReloadKey] = useState(0);

  function handleIframeLoad(): void {
    setIframeError(null);
  }

  function handleIframeError(): void {
    setIframeError("Failed to load API documentation. Is the build server running?");
  }

  function refreshIframe(): void {
    setReloadKey((prev) => prev + 1);
    setIframeError(null);
  }

  function openOpenApiSpec(): void {
    window.open("/openapi.json", "_blank", "noopener,noreferrer");
  }

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>API Console</h1>
          <p className="muted">
            Build Server 의 OpenAPI contract 를 Scalar API Reference 로 렌더링합니다.
            iframe 안의 API Reference 의 <strong>좌측 endpoint list</strong> 에서
            endpoint 를 선택하고, <strong>우측 detail panel</strong> 에서
            <strong>Try it out</strong> 으로 직접 호출해볼 수 있습니다.
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={refreshIframe}
            data-testid="api-console-refresh"
          >
            ↻ Refresh
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={openOpenApiSpec}
            data-testid="api-console-raw"
          >
            Raw OpenAPI JSON ↗
          </button>
          <Link
            to="/build-request"
            className="btn-primary"
            data-testid="api-console-go-build"
          >
            Go to Build Request →
          </Link>
        </div>
      </header>

      <div className="frame-wrap" data-testid="api-console-frame">
        <iframe
          key={reloadKey}
          src={API_DOCS_URL}
          title="Build Server Scalar API Reference"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
        />
        {iframeError ? (
          <div className="overlay error" role="alert">
            <strong>{iframeError}</strong>
            <p>백엔드 (port 3000) 가 동작 중인지 확인하세요.</p>
            <button type="button" className="btn-secondary" onClick={refreshIframe}>
              Retry
            </button>
          </div>
        ) : null}
      </div>

      <details className="hint-block">
        <summary>About this view</summary>
        <p>
          Scalar API Reference 는 build server 가 직접 서빙합니다 (<code>{API_DOCS_URL}</code>).
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
  );
}
