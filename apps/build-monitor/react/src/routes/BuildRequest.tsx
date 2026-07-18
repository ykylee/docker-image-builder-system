// TASK-099 (M4.5 Group E): BuildRequest (React) — POST /builds payload 직접 작성.
//
// Svelte src/routes/BuildRequest.svelte 와 1:1 정합. Svelte 측 admin pages 와
// 동일하게 cross-framework 공존 상태로 신규 추가 — App.tsx 의 /build-request
// 라우트가 React 측 page 로 교체. Svelte 측 route 는 그대로 유지되며
// TASK-101 Group G 에서 일괄 정리 예정.
//
// 동작 모드:
//   - login 직후 redirect 되어 진입. userId 는 localStorage 의 userId 키에서
//     직접 read (Svelte 측 session.ts 의 userIdStore 와 동등).
//   - userId 가 없으면 Login 페이지(`/login`) 로 redirect.
//   - payload 가 zod schema 와 일치해야 backend 가 202 (BuildAcceptedResponse)
//     또는 409 (BuildDuplicateResponse) 를 반환. invalid payload 는 zod 가
//     500 으로 reject → parseApiError 가 field-level banner 로 변환.
//
// 표준 검증 시나리오:
//   1) preset "Hello World" → "Submit Build" 클릭 → accepted toast + 결과 패널
//   2) 같은 appName 으로 즉시 재시도 → duplicate 배너 + 기존 build 표시
//   3) "Random appName" 클릭 → 다른 appName 으로 payload 갱신 후 submit

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";

import { StatusPill } from "@/components/StatusPill";
import {
  parseApiError,
  submitBuildRequest,
  type BuildAcceptedResponse,
  type BuildDuplicateResponse,
  type BuildRequestPayload,
  type BuildRequestResponse
} from "@/lib/api";

import "./BuildRequest.css";

interface FieldError {
  path: string;
  message: string;
}

interface FormState {
  appName: string;
  requestedBy: string;
  objectKey: string;
  checksumSha256: string;
  sizeBytes: number;
  entrypointPath: string;
  dockerfilePath: string;
  previewTtlMinutes: number;
}

const DEFAULT_FORM: FormState = {
  appName: "",
  requestedBy: "",
  objectKey: "",
  checksumSha256: "",
  sizeBytes: 0,
  entrypointPath: "src/index.ts",
  dockerfilePath: "Dockerfile",
  previewTtlMinutes: 60
};

function makePreset(
  kind: "hello" | "minimal" | "typescript",
  userId: string | null
): FormState {
  const ts = Date.now().toString(36);
  const owner = userId ?? "alice";
  if (kind === "hello") {
    return {
      appName: `hello-${ts}`,
      requestedBy: owner,
      objectKey: "ref://github.com/example/hello-world",
      checksumSha256: "0".repeat(64),
      sizeBytes: 12345,
      entrypointPath: "src/index.ts",
      dockerfilePath: "Dockerfile",
      previewTtlMinutes: 60
    };
  }
  if (kind === "minimal") {
    return {
      appName: `minimal-${ts}`,
      requestedBy: owner,
      objectKey: "ref://github.com/example/minimal",
      checksumSha256: "0".repeat(64),
      sizeBytes: 4096,
      entrypointPath: "main.py",
      dockerfilePath: "Dockerfile",
      previewTtlMinutes: 15
    };
  }
  return {
    appName: `ts-app-${ts}`,
    requestedBy: owner,
    objectKey: "ref://github.com/example/ts-app",
    checksumSha256: "0".repeat(64),
    sizeBytes: 102400,
    entrypointPath: "src/server.ts",
    dockerfilePath: "Dockerfile",
    previewTtlMinutes: 60
  };
}

function randomizeAppName(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 6);
  return `random-${ts}-${rnd}`;
}

function isAccepted(r: BuildRequestResponse | null): r is BuildAcceptedResponse {
  return !!r && r.accepted === true && r.duplicate === false;
}

function isDuplicate(r: BuildRequestResponse | null): r is BuildDuplicateResponse {
  return !!r && r.accepted === false && r.duplicate === true;
}

export function BuildRequest(): ReactElement {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitFieldErrors, setSubmitFieldErrors] = useState<FieldError[]>([]);
  const [lastResult, setLastResult] = useState<BuildRequestResponse | null>(null);

  // input ref — submit 시점에 React state batching 을 우회하여 native
  // input value 를 직접 read. controlled input 의 DOM property value 는
  // React 가 dispatch 후에 동기화되지만, onSubmit handler 가 호출되는
  // 시점에는 React state 가 batched 상태로 남아 있을 수 있어 production
  // 환경에서도 같은 race 가 발생할 수 있음. refs 는 항상 최신 DOM 값.
  // React 19 의 useRef<HTMLInputElement>(null) 는 RefObject<HTMLInputElement | null>
  // 으로 추론되므로 명시적 | null 표기.
  const refs = {
    appName: useRef<HTMLInputElement | null>(null),
    requestedBy: useRef<HTMLInputElement | null>(null),
    objectKey: useRef<HTMLInputElement | null>(null),
    checksumSha256: useRef<HTMLInputElement | null>(null),
    sizeBytes: useRef<HTMLInputElement | null>(null),
    entrypointPath: useRef<HTMLInputElement | null>(null),
    dockerfilePath: useRef<HTMLInputElement | null>(null),
    previewTtlMinutes: useRef<HTMLInputElement | null>(null)
  };

  // userId store + 첫 진입 시 default preset 적용.
  useEffect(() => {
    const stored = localStorage.getItem("userId");
    if (!stored) {
      setLoading(false);
      navigate("/login", { replace: true });
      return;
    }
    setUserId(stored);
    setForm({ ...makePreset("hello", stored) });
    setLoading(false);
  }, [navigate]);

  // raw payload JSON preview. 마지막 form 변경마다 자동 갱신.
  const rawPayloadPreview = useMemo(() => {
    return JSON.stringify(
      {
        appName: form.appName,
        requestedBy: form.requestedBy,
        sourceArchive: {
          objectKey: form.objectKey,
          checksumSha256: form.checksumSha256,
          sizeBytes: form.sizeBytes
        },
        entrypointPath: form.entrypointPath,
        dockerfilePath: form.dockerfilePath,
        previewTtlMinutes: form.previewTtlMinutes
      },
      null,
      2
    );
  }, [form]);

  function applyPreset(kind: "hello" | "minimal" | "typescript"): void {
    setForm(makePreset(kind, userId));
  }

  function resetForm(): void {
    setLastResult(null);
    setSubmitError(null);
    setSubmitFieldErrors([]);
    setForm(makePreset("hello", userId));
  }

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setSubmitError(null);
    setSubmitFieldErrors([]);

    // React state batching 회피: input ref 로 native DOM value 직접 read.
    // fireEvent.change → setForm → setForm batch → submit 호출 사이의 race
    // 를 ref 기반 read 로 우회. refs 는 React render 와 무관하게 항상 최신
    // DOM property 를 가리키므로 controlled input 의 .value 가 React state
    // 와 sync 되지 않은 시점에서도 안정적.
    const readField = (ref: React.RefObject<HTMLInputElement | null>): string =>
      ref.current?.value ?? "";
    const appNameValue = readField(refs.appName);
    const requestedByValue = readField(refs.requestedBy);
    const objectKeyValue = readField(refs.objectKey);
    const checksumValue = readField(refs.checksumSha256);
    const sizeBytesValue = Number(readField(refs.sizeBytes));
    const entrypointValue = readField(refs.entrypointPath);
    const dockerfileValue = readField(refs.dockerfilePath);
    const previewTtlValue = Number(readField(refs.previewTtlMinutes));

    // form validation — zod 가 backend 에서도 검증하지만 client-side sanity
    // check 로 빠르게 피드백. BuildRequest schema 그대로. native form
    // element 의 현재 값을 사용 (React state batching 회피).
    const errs: FieldError[] = [];
    if (!appNameValue || appNameValue.length < 1) {
      errs.push({ path: "appName", message: "Required. Canonical app identity." });
    }
    if (!requestedByValue || requestedByValue.length < 1) {
      errs.push({ path: "requestedBy", message: "Required. Owner userId." });
    }
    if (!objectKeyValue || objectKeyValue.length < 1) {
      errs.push({
        path: "sourceArchive.objectKey",
        message: "Required. Skill 이 발행한 archive reference."
      });
    }
    if (!checksumValue || checksumValue.length < 1) {
      errs.push({
        path: "sourceArchive.checksumSha256",
        message: "Required. 64 hex chars expected."
      });
    }
    if (sizeBytesValue < 0 || !Number.isFinite(sizeBytesValue)) {
      errs.push({
        path: "sourceArchive.sizeBytes",
        message: "Non-negative integer."
      });
    }
    if (!entrypointValue || entrypointValue.length < 1) {
      errs.push({
        path: "entrypointPath",
        message: "Required. Container 시작점."
      });
    }
    if (!dockerfileValue || dockerfileValue.length < 1) {
      errs.push({
        path: "dockerfilePath",
        message: "Required. Default 'Dockerfile'."
      });
    }
    if (!Number.isInteger(previewTtlValue) || previewTtlValue <= 0) {
      errs.push({
        path: "previewTtlMinutes",
        message: "Positive integer. Default 60."
      });
    }
    if (errs.length > 0) {
      setSubmitFieldErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      const payload: BuildRequestPayload = {
        appName: appNameValue,
        requestedBy: requestedByValue,
        sourceArchive: {
          objectKey: objectKeyValue,
          checksumSha256: checksumValue,
          sizeBytes: Math.trunc(sizeBytesValue)
        },
        entrypointPath: entrypointValue,
        dockerfilePath: dockerfileValue,
        previewTtlMinutes: previewTtlValue,
        metadata: {}
      };
      const result = await submitBuildRequest(payload);
      setLastResult(result);
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed.fieldErrors.length > 0) {
        setSubmitFieldErrors(parsed.fieldErrors);
      } else {
        setSubmitError(parsed.summary);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="muted">Loading…</p>;
  }

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>Build Request</h1>
          <p className="muted">
            Skill → Host 의 <code>POST /builds</code> payload 를 직접 작성하여
            제출합니다. 응답은 build server 의{" "}
            <code>BuildAcceptedResponse</code> (HTTP 202) 또는{" "}
            <code>BuildDuplicateResponse</code> (HTTP 409) 중 하나로 옵니다.
          </p>
        </div>
      </header>

      <div className="presets">
        <span className="label">Preset:</span>
        <button
          type="button"
          className="preset-btn"
          onClick={() => applyPreset("hello")}
          data-testid="req-preset-hello"
        >
          Hello World
        </button>
        <button
          type="button"
          className="preset-btn"
          onClick={() => applyPreset("minimal")}
          data-testid="req-preset-minimal"
        >
          Minimal (Python)
        </button>
        <button
          type="button"
          className="preset-btn"
          onClick={() => applyPreset("typescript")}
          data-testid="req-preset-typescript"
        >
          TypeScript
        </button>
        <button
          type="button"
          className="preset-btn secondary"
          onClick={() => setForm((prev) => ({ ...prev, appName: randomizeAppName() }))}
          data-testid="req-random"
        >
          ↻ Random appName
        </button>
      </div>

      <form className="form" onSubmit={submit} data-testid="req-form">
        <div className="grid">
          <label>
            <span className="lbl">appName <em>*</em></span>
            <input
              type="text"
              name="appName"
              ref={refs.appName}
              value={form.appName}
              onChange={(e) => setForm((prev) => ({ ...prev, appName: e.target.value }))}
              placeholder="hello-world"
              data-testid="req-appName"
            />
            <small className="hint">Canonical app identity. Active-build lock key.</small>
          </label>

          <label>
            <span className="lbl">requestedBy <em>*</em></span>
            <input
              type="text"
              name="requestedBy"
              ref={refs.requestedBy}
              value={form.requestedBy}
              onChange={(e) => setForm((prev) => ({ ...prev, requestedBy: e.target.value }))}
              placeholder="alice"
              data-testid="req-requestedBy"
            />
            <small className="hint">Owner userId. 같은 값으로 build list filter 가능.</small>
          </label>

          <label>
            <span className="lbl">sourceArchive.objectKey <em>*</em></span>
            <input
              type="text"
              name="objectKey"
              ref={refs.objectKey}
              value={form.objectKey}
              onChange={(e) => setForm((prev) => ({ ...prev, objectKey: e.target.value }))}
              placeholder="ref://github.com/owner/repo"
              data-testid="req-objectKey"
            />
            <small className="hint">Skill 이 발행한 archive reference.</small>
          </label>

          <label>
            <span className="lbl">sourceArchive.checksumSha256 <em>*</em></span>
            <input
              type="text"
              name="checksumSha256"
              ref={refs.checksumSha256}
              value={form.checksumSha256}
              onChange={(e) => setForm((prev) => ({ ...prev, checksumSha256: e.target.value }))}
              placeholder="0..0 (64 hex)"
              data-testid="req-checksum"
            />
            <small className="hint">실제 upload 시 server 가 검증. zod 는 min(1) 만 검사.</small>
          </label>

          <label>
            <span className="lbl">sourceArchive.sizeBytes <em>*</em></span>
            <input
              type="number"
              name="sizeBytes"
              ref={refs.sizeBytes}
              min={0}
              step={1}
              value={form.sizeBytes}
              onChange={(e) => {
                const next = e.target.value === "" ? 0 : Number(e.target.value);
                setForm((prev) => ({ ...prev, sizeBytes: Number.isFinite(next) ? next : 0 }));
              }}
              data-testid="req-sizeBytes"
            />
            <small className="hint">Archive byte size. non-negative.</small>
          </label>

          <label>
            <span className="lbl">entrypointPath <em>*</em></span>
            <input
              type="text"
              name="entrypointPath"
              ref={refs.entrypointPath}
              value={form.entrypointPath}
              onChange={(e) => setForm((prev) => ({ ...prev, entrypointPath: e.target.value }))}
              placeholder="src/index.ts"
              data-testid="req-entrypoint"
            />
            <small className="hint">Container 시작점.</small>
          </label>

          <label>
            <span className="lbl">dockerfilePath</span>
            <input
              type="text"
              name="dockerfilePath"
              ref={refs.dockerfilePath}
              value={form.dockerfilePath}
              onChange={(e) => setForm((prev) => ({ ...prev, dockerfilePath: e.target.value }))}
              placeholder="Dockerfile"
              data-testid="req-dockerfile"
            />
            <small className="hint">Default <code>Dockerfile</code>.</small>
          </label>

          <label>
            <span className="lbl">previewTtlMinutes</span>
            <input
              type="number"
              name="previewTtlMinutes"
              ref={refs.previewTtlMinutes}
              min={1}
              step={1}
              value={form.previewTtlMinutes}
              onChange={(e) => {
                const next = e.target.value === "" ? 0 : Number(e.target.value);
                setForm((prev) => ({
                  ...prev,
                  previewTtlMinutes: Number.isFinite(next) ? next : 0
                }));
              }}
              data-testid="req-ttl"
            />
            <small className="hint">Preview container TTL.</small>
          </label>
        </div>

        <div className="actions">
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting}
            data-testid="req-submit"
          >
            {submitting ? "Submitting…" : "Submit Build"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={resetForm}
            data-testid="req-reset"
          >
            Reset form
          </button>
          <Link to="/builds" className="btn-secondary" data-testid="req-list">
            View Builds list →
          </Link>
        </div>
      </form>

      {submitFieldErrors.length > 0 ? (
        <div className="banner error" role="alert" data-testid="req-field-errors">
          <strong>Form validation failed</strong>
          <ul className="field-errors">
            {submitFieldErrors.map((fe) => (
              <li key={fe.path}>
                <code className="field-path">{fe.path}</code>
                <span className="field-msg">{fe.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {submitError ? (
        <div className="banner error" role="alert" data-testid="req-error">
          <strong>Submit failed</strong>
          <pre>{submitError}</pre>
        </div>
      ) : null}

      {lastResult ? (
        <section className="result" data-testid="req-result">
          {isAccepted(lastResult) ? (
            <>
              <header className="result-head accepted">
                <span className="badge">202 Accepted</span>
                <h2>Build queued</h2>
              </header>
              <p>
                <code>appName={lastResult.build.appName}</code> 로 새 build 가
                QUEUED 상태로 등록됨. build server 가{" "}
                <code>REQUEST_ACCEPTED</code> phase 로 전이.
              </p>
              <dl className="kv">
                <dt>buildId</dt>
                <dd className="mono">{lastResult.build.buildId}</dd>
                <dt>status</dt>
                <dd>
                  <StatusPill
                    status={lastResult.build.status}
                    lifecycleStatus={lastResult.build.lifecycleStatus}
                  />
                </dd>
                <dt>phase</dt>
                <dd className="mono">{lastResult.build.phase}</dd>
                <dt>createdAt</dt>
                <dd className="mono">{lastResult.build.createdAt}</dd>
              </dl>
              <div className="actions">
                <Link
                  to={`/builds/${lastResult.build.buildId}`}
                  className="btn-primary"
                  data-testid="req-open-detail"
                >
                  Open Build Detail →
                </Link>
                <Link to="/builds" className="btn-secondary">
                  Back to list
                </Link>
              </div>
            </>
          ) : isDuplicate(lastResult) ? (
            <>
              <header className="result-head duplicate">
                <span className="badge">409 Duplicate</span>
                <h2>Active build already exists</h2>
              </header>
              <p>
                <code>appName={lastResult.build.appName}</code> 에 대해 active
                build 가 이미 존재. reason: <strong>{lastResult.reason}</strong>.
                기존 build 가 그대로 유지됨.
              </p>
              <dl className="kv">
                <dt>buildId</dt>
                <dd className="mono">{lastResult.build.buildId}</dd>
                <dt>status</dt>
                <dd>
                  <StatusPill
                    status={lastResult.build.status}
                    lifecycleStatus={lastResult.build.lifecycleStatus}
                  />
                </dd>
                <dt>phase</dt>
                <dd className="mono">{lastResult.build.phase}</dd>
              </dl>
              <div className="actions">
                <Link
                  to={`/builds/${lastResult.build.buildId}`}
                  className="btn-primary"
                  data-testid="req-open-existing"
                >
                  Open existing Build →
                </Link>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    setForm((prev) => ({ ...prev, appName: randomizeAppName() }))
                  }
                >
                  Try different appName
                </button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      <details className="raw-payload">
        <summary>Raw payload preview (JSON)</summary>
        <pre>{rawPayloadPreview}</pre>
      </details>
    </section>
  );
}
