// TASK-091/092: BuildDetail (React) — /builds/:buildId 의 canonical 4 block +
// PhaseTimeline + LogStream + Legacy preview 마이그레이션.
//
// Svelte src/routes/BuildDetail.svelte 와 1:1 정합. canonical build/test/
// deploy/result-delivery block 은 그대로 노출하고, legacy preview-* field 는
// deprecated 배지와 함께 보존 (TASK-060 follow-up 에서 제거 예정).
//
// 데이터 흐름: react-router-dom useParams + Zustand useBuildDetailStore
// (TASK-092) — useState 4개 + Promise.all lifecycle 을 store action 으로
// 통합. StrictMode mount/unmount/mount 2회 fire 대응은 store 내부의
// AbortSignal guard 가 처리.

import { useEffect } from "react";
import type { CSSProperties, ReactElement } from "react";
import { Link, useParams } from "react-router-dom";

import { LogStream } from "@/components/LogStream";
import { PhaseTimeline } from "@/components/PhaseTimeline";
import { StatusPill } from "@/components/StatusPill";
import { useBuildDetailStore } from "@/lib/stores/buildDetailStore";

import "./BuildDetail.css";

// loading / not-found placeholder 스타일.
const placeholderStyle: CSSProperties = {
  padding: "var(--dib-space-xxl, 32px)",
  fontFamily: "var(--dib-font-sans)",
  color: "var(--dib-color-text-primary)"
};

// datalist key 생성 helper — label 의 padding/breaks 없이 한 줄 노출.
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

export function BuildDetail(): ReactElement {
  // useParams 가 `{ buildId: string }` 으로 narrow — optional chaining 으로
  // undefined (deep link 진입 시점) / 빈 string 모두 fallback.
  const params = useParams<{ buildId: string }>();
  const buildId = params.buildId ?? "";

  // 개별 selector 로 구독 — store 전체 re-render 회피.
  const build = useBuildDetailStore((s) => s.build);
  const logs = useBuildDetailStore((s) => s.logs);
  const loading = useBuildDetailStore((s) => s.loading);
  const error = useBuildDetailStore((s) => s.error);
  const fetchBuild = useBuildDetailStore((s) => s.fetchBuild);
  const reset = useBuildDetailStore((s) => s.reset);

  useEffect(() => {
    // buildId 가 빈 string 이면 early return — deep link 와 placeholder 의
    // 안전 정합. URL 직접 입력 + mount 직후 race 회피.
    if (!buildId) {
      reset();
      return;
    }

    const controller = new AbortController();
    fetchBuild({ buildId, signal: controller.signal });

    return () => {
      controller.abort();
    };

    // reset / fetchBuild 는 store/action reference 로 안정적.
    // buildId 가 바뀔 때만 fetch 재시작.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildId]);

  if (loading) {
    return (
      <section
        className="detail"
        data-testid="build-detail-loading"
        style={placeholderStyle}
      >
        <p className="muted">Loading build {buildId}…</p>
      </section>
    );
  }

  if (error || !build) {
    return (
      <section
        className="detail"
        data-testid="build-detail-error"
        style={placeholderStyle}
      >
        <p className="err" role="alert">
          {error ?? "Build not found."}
        </p>
        <Link to="/builds" className="back-link" data-testid="back-to-builds">
          ← Back to builds
        </Link>
      </section>
    );
  }

  return (
    <section className="detail" data-testid="build-detail">
      {/* TASK-091 self-review amend 1: 정상 상태에서도 페이지 상단에
       * Back link 노출. Svelte BuildDetail 은 BuildRow 의 buildId <Link> 가
       * 자연스러운 back path 였지만, React BuildDetail 은 standalone 이라
       * 명시적 Back 이 운영자 UX 에 더 자연스러움. error state 와 동일
       * data-testid 로 회귀 가드 일관성 유지. */}
      <Link to="/builds" className="back-link" data-testid="back-to-builds">
        ← Back to builds
      </Link>

      <header className="head">
        <h1 className="mono">{build.build.buildId}</h1>
        <StatusPill
          status={build.build.status}
          lifecycleStatus={build.build.lifecycleStatus}
        />
      </header>

      {/* TASK-163 (P2-M4): 실패 이유를 상단으로 승격.
       *
       * 이 값은 P2-M3(TASK-162) 전까지 **항상 null 이었다** — 서버가
       * `last_error_code`/`last_error_message` 를 한 번도 쓰지 않았기 때문이다.
       * 즉 아래 meta 목록의 "Last error" 행은 늘 "—" 만 찍는 죽은 UI 였다.
       * 이제 실제로 채워지므로, 실패한 빌드에서 운영자가 가장 먼저 봐야 할
       * 정보를 목록 중간이 아니라 눈에 띄는 자리에 둔다. 성공한 빌드에는
       * 아무것도 렌더하지 않는다. */}
      {build.lastError ? (
        <div className="error-banner" role="alert" data-testid="build-last-error">
          <span className="error-banner__code mono">{build.lastError.code}</span>
          <span className="error-banner__message">{build.lastError.message}</span>
        </div>
      ) : null}

      <dl className="meta">
        <div>
          <dt>App</dt>
          <dd className="mono">{build.build.appName}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDateTime(build.build.createdAt)}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{formatDateTime(build.build.updatedAt)}</dd>
        </div>
        <div>
          <dt>Phase</dt>
          <dd className="mono">{build.build.phase}</dd>
        </div>
        <div>
          <dt>Lifecycle</dt>
          <dd className="mono">
            {build.build.lifecycleStatus ?? build.build.status}
          </dd>
        </div>
        <div>
          <dt>Last error</dt>
          <dd className="mono">
            {build.lastError
              ? `${build.lastError.code}: ${build.lastError.message}`
              : "—"}
          </dd>
        </div>
      </dl>

      {/* TASK-060: canonical build/test/deploy/result-delivery sections.
       * Build lifecycle / Container test / Deployment / Result delivery 가
       * source of truth. (TASK-160 에서 legacy preview-* 섹션 제거) */}
      <section className="block" data-testid="block-lifecycle">
        <h2>Build lifecycle</h2>
        <dl className="kv">
          <div>
            <dt>Status</dt>
            <dd className="mono">
              {build.lifecycle?.status ??
                build.build.lifecycleStatus ??
                build.build.status}
            </dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{formatDateTime(build.lifecycle?.startedAt)}</dd>
          </div>
          <div>
            <dt>Finished</dt>
            <dd>{formatDateTime(build.lifecycle?.finishedAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="block" data-testid="block-test">
        <h2>Container test</h2>
        <dl className="kv">
          <div>
            <dt>Status</dt>
            <dd className="mono">{build.test?.status ?? "NOT_STARTED"}</dd>
          </div>
          {/* TASK-160: deprecated "Legacy preview" 섹션을 제거하면서 런타임 URL 을
              canonical 블록으로 옮겼다. TASK-161 (P2-M2) 에서 필드명도
              previewUrl → runtimeUrl 로 정렬 완료. */}
          <div>
            <dt>Runtime URL</dt>
            <dd className="mono">{build.build.runtimeUrl ?? "—"}</dd>
          </div>
          <div>
            <dt>Container running</dt>
            <dd>
              {build.test?.containerRunning === null ||
              build.test?.containerRunning === undefined
                ? "—"
                : String(build.test.containerRunning)}
            </dd>
          </div>
          <div>
            <dt>Health check</dt>
            <dd>
              {build.test?.healthCheckPassed === null ||
              build.test?.healthCheckPassed === undefined
                ? "—"
                : String(build.test.healthCheckPassed)}
            </dd>
          </div>
          <div>
            <dt>Port open</dt>
            <dd>
              {build.test?.portOpen === null ||
              build.test?.portOpen === undefined
                ? "—"
                : String(build.test.portOpen)}
            </dd>
          </div>
          <div>
            <dt>Stability window</dt>
            <dd>
              {build.test?.stabilityWindowPassed === null ||
              build.test?.stabilityWindowPassed === undefined
                ? "—"
                : String(build.test.stabilityWindowPassed)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="block" data-testid="block-deploy">
        <h2>Deployment</h2>
        <dl className="kv">
          <div>
            <dt>Status</dt>
            <dd className="mono">{build.deploy?.status ?? "NOT_STARTED"}</dd>
          </div>
          <div>
            <dt>Target type</dt>
            <dd className="mono">{build.deploy?.targetType ?? "—"}</dd>
          </div>
          <div>
            <dt>Result ref</dt>
            <dd className="mono">{build.deploy?.resultRef ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="block" data-testid="block-result-delivery">
        <h2>Result delivery</h2>
        <dl className="kv">
          <div>
            <dt>Status</dt>
            <dd className="mono">
              {build.resultDelivery?.status ?? "NOT_STARTED"}
            </dd>
          </div>
          <div>
            <dt>Mode</dt>
            <dd className="mono">{build.resultDelivery?.mode ?? "—"}</dd>
          </div>
          <div>
            <dt>Delivered at</dt>
            <dd>{formatDateTime(build.resultDelivery?.deliveredAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="block" data-testid="block-phases">
        <h2>Phases</h2>
        <PhaseTimeline
          phaseHistory={build.phaseHistory ?? []}
          currentPhase={build.currentPhase ?? null}
        />
      </section>

      <section className="block" data-testid="block-logs">
        <h2>Logs</h2>
        <LogStream entries={logs?.logs ?? []} />
      </section>
    </section>
  );
}
