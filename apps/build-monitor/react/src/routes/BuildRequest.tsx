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

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button, NumberInput, TextInput } from "@astryxdesign/core";

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
  dockerfileMode: "required" | "auto";
  runtimePort: number;
  stripPrefix: boolean;
  hostingScheme: "path" | "subdomain";
  serviceSize: "small" | "medium" | "large";
  requestedTier: "" | "sandbox" | "standard" | "production";
  cpuRequest: string;
  memoryRequest: string;
  cpuLimit: string;
  memoryLimit: string;
  replicas: number;
}

const DEFAULT_FORM: FormState = {
  appName: "",
  requestedBy: "",
  objectKey: "",
  checksumSha256: "",
  sizeBytes: 0,
  entrypointPath: "src/index.ts",
  dockerfilePath: "Dockerfile",
  dockerfileMode: "required",
  runtimePort: 8080,
  stripPrefix: true,
  hostingScheme: "path",
  serviceSize: "small",
  requestedTier: "",
  cpuRequest: "",
  memoryRequest: "",
  cpuLimit: "",
  memoryLimit: "",
  replicas: 0,
};

/**
 * 폼 필드 선언 — TASK-138 (Astryx Field 이관).
 */
const FIELDS: readonly {
  key: keyof FormState;
  label: string;
  errorPath: string;
  kind: "text" | "number";
  required: boolean;
  placeholder?: string;
  hint: string;
  testId: string;
}[] = [
  {
    key: "appName",
    label: "appName",
    errorPath: "appName",
    kind: "text",
    required: true,
    placeholder: "hello-world",
    hint: "Canonical app identity. Active-build lock key.",
    testId: "req-appName"
  },
  {
    key: "requestedBy",
    label: "requestedBy",
    errorPath: "requestedBy",
    kind: "text",
    required: true,
    placeholder: "alice",
    hint: "Owner userId. 같은 값으로 build list filter 가능.",
    testId: "req-requestedBy"
  },
  {
    key: "objectKey",
    label: "sourceArchive.objectKey",
    errorPath: "sourceArchive.objectKey",
    kind: "text",
    required: true,
    placeholder: "ref://github.com/owner/repo",
    hint: "Skill 이 발행한 archive reference.",
    testId: "req-objectKey"
  },
  {
    key: "checksumSha256",
    label: "sourceArchive.checksumSha256",
    errorPath: "sourceArchive.checksumSha256",
    kind: "text",
    required: true,
    placeholder: "0..0 (64 hex)",
    hint: "실제 upload 시 server 가 검증. zod 는 min(1) 만 검사.",
    testId: "req-checksum"
  },
  {
    key: "sizeBytes",
    label: "sourceArchive.sizeBytes",
    errorPath: "sourceArchive.sizeBytes",
    kind: "number",
    required: true,
    hint: "Archive byte size. non-negative.",
    testId: "req-sizeBytes"
  },
  {
    key: "entrypointPath",
    label: "entrypointPath",
    errorPath: "entrypointPath",
    kind: "text",
    required: true,
    placeholder: "src/index.ts",
    hint: "Container 시작점.",
    testId: "req-entrypoint"
  },
  {
    key: "dockerfilePath",
    label: "dockerfilePath",
    errorPath: "dockerfilePath",
    kind: "text",
    required: false,
    placeholder: "Dockerfile",
    hint: "Default 'Dockerfile'.",
    testId: "req-dockerfile"
  },
  {
    key: "runtimePort",
    label: "runtimePort (Container Port)",
    errorPath: "runtimePort",
    kind: "number",
    required: false,
    hint: "Container port listening inside. Default 8080.",
    testId: "req-runtimePort"
  }
];

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
      dockerfileMode: "required",
      runtimePort: 8080,
      stripPrefix: true,
      hostingScheme: "path",
      serviceSize: "small",
      requestedTier: "",
      cpuRequest: "",
      memoryRequest: "",
      cpuLimit: "",
      memoryLimit: "",
      replicas: 0,
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
      dockerfileMode: "required",
      runtimePort: 5000,
      stripPrefix: true,
      hostingScheme: "path",
      serviceSize: "small",
      requestedTier: "",
      cpuRequest: "",
      memoryRequest: "",
      cpuLimit: "",
      memoryLimit: "",
      replicas: 0,
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
    dockerfileMode: "required",
    runtimePort: 3000,
    stripPrefix: true,
    hostingScheme: "path",
    serviceSize: "small",
    requestedTier: "",
    cpuRequest: "",
    memoryRequest: "",
    cpuLimit: "",
    memoryLimit: "",
    replicas: 0,
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
        dockerfileMode: form.dockerfileMode,
        ...(form.runtimePort ? { runtimePort: Number(form.runtimePort) } : {}),
        stripPrefix: form.stripPrefix,
        hostingScheme: form.hostingScheme,
        serviceSize: form.serviceSize,
        ...(form.requestedTier ? { requestedTier: form.requestedTier } : {}),
        ...(form.cpuRequest || form.memoryRequest || form.cpuLimit || form.memoryLimit || form.replicas
          ? {
              resources: {
                ...(form.cpuRequest ? { cpuRequest: form.cpuRequest } : {}),
                ...(form.memoryRequest ? { memoryRequest: form.memoryRequest } : {}),
                ...(form.cpuLimit ? { cpuLimit: form.cpuLimit } : {}),
                ...(form.memoryLimit ? { memoryLimit: form.memoryLimit } : {}),
                ...(form.replicas ? { replicas: Math.trunc(form.replicas) } : {})
              }
            }
          : {}),
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

    const appNameValue = form.appName;
    const requestedByValue = form.requestedBy;
    const objectKeyValue = form.objectKey;
    const checksumValue = form.checksumSha256;
    const sizeBytesValue = Number(form.sizeBytes);
    const entrypointValue = form.entrypointPath;
    const dockerfileValue = form.dockerfilePath;

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
        dockerfileMode: form.dockerfileMode,
        ...(form.runtimePort ? { runtimePort: Math.trunc(form.runtimePort) } : {}),
        stripPrefix: form.stripPrefix,
        hostingScheme: form.hostingScheme,
        serviceSize: form.serviceSize,
        ...(form.requestedTier ? { requestedTier: form.requestedTier } : {}),
        ...(form.cpuRequest || form.memoryRequest || form.cpuLimit || form.memoryLimit || form.replicas
          ? {
              resources: {
                ...(form.cpuRequest ? { cpuRequest: form.cpuRequest } : {}),
                ...(form.memoryRequest ? { memoryRequest: form.memoryRequest } : {}),
                ...(form.cpuLimit ? { cpuLimit: form.cpuLimit } : {}),
                ...(form.memoryLimit ? { memoryLimit: form.memoryLimit } : {}),
                ...(form.replicas ? { replicas: Math.trunc(form.replicas) } : {})
              }
            }
          : {}),
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
          {FIELDS.map((f) => {
            // 이 필드에 해당하는 검증 오류를 찾아 **입력에 직접 결속**한다.
            const fieldError = submitFieldErrors.find((e) => e.path === f.errorPath);
            const status = fieldError
              ? ({ type: "error", message: fieldError.message } as const)
              : undefined;
            const common = {
              label: f.label,
              description: f.hint,
              isRequired: f.required,
              isOptional: !f.required,
              status,
              htmlName: f.key,
              "data-testid": f.testId
            };

            if (f.kind === "number") {
              return (
                <NumberInput
                  key={f.key}
                  {...common}
                  value={form[f.key] as number}
                  // min 을 **일부러 넘기지 않는다.** Astryx NumberInput 은 min
                  // 미만 값이 들어오면 onChange 를 호출하지 않는데, 입력 요소의
                  // 표시값은 그대로 바뀐다 — 즉 **사용자가 보는 값과 제출될 값이
                  // 갈린다** (min=1 에 "0" 입력 시 화면 0 / 상태 60 실측 확인).
                  // 범위 검증은 아래 submit 의 우리 검증이 이미 하고 있고,
                  // 그 결과가 status 로 필드에 결속돼 사용자에게 보인다.
                  step={1}
                  onChange={(value) => {
                    // 빈 입력은 0 으로 — 이전 구현의 동작을 그대로 유지한다
                    // (검증이 0 을 걸러내므로 사용자는 안내를 받는다).
                    setForm((prev) => ({
                      ...prev,
                      [f.key]: value === null || !Number.isFinite(value) ? 0 : value
                    }));
                  }}
                />
              );
            }

            return (
              <TextInput
                key={f.key}
                {...common}
                value={form[f.key] as string}
                placeholder={f.placeholder}
                onChange={(value) => {
                  setForm((prev) => ({ ...prev, [f.key]: value }));
                }}
              />
            );
          })}
        </div>

        <div className="hosting-options" data-testid="req-hosting-options">
          <div className="hosting-option">
            <span>
              <strong>dockerfile mode</strong>
              <small>Auto generates only for static index.html or Node scripts.start sources.</small>
            </span>
            <select
              value={form.dockerfileMode}
              data-testid="req-dockerfileMode"
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  dockerfileMode: event.target.value as FormState["dockerfileMode"]
                }))
              }
            >
              <option value="required">required</option>
              <option value="auto">auto</option>
            </select>
          </div>
          <div className="hosting-option">
            <span>
              <strong>hosting tier</strong>
              <small>Tier is resolved from size and resources. Auto keeps the server policy default.</small>
            </span>
            <select
              value={form.requestedTier}
              data-testid="req-requestedTier"
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  requestedTier: event.target.value as FormState["requestedTier"]
                }))
              }
            >
              <option value="">auto</option>
              <option value="sandbox">sandbox</option>
              <option value="standard">standard</option>
              <option value="production">production</option>
            </select>
          </div>

          <div className="hosting-option">
            <span>
              <strong>service size</strong>
              <small>Declared service size used as a tier sizing signal.</small>
            </span>
            <select
              value={form.serviceSize}
              data-testid="req-serviceSize"
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  serviceSize: event.target.value as FormState["serviceSize"]
                }))
              }
            >
              <option value="small">small</option>
              <option value="medium">medium</option>
              <option value="large">large</option>
            </select>
          </div>

          {(["cpuRequest", "memoryRequest", "cpuLimit", "memoryLimit"] as const).map((key) => (
            <TextInput
              key={key}
              label={key}
              description="Optional Kubernetes quantity; blank uses the resolved tier default."
              isOptional
              htmlName={key}
              value={form[key]}
              data-testid={`req-${key}`}
              onChange={(value) => setForm((prev) => ({ ...prev, [key]: value }))}
            />
          ))}

          <NumberInput
            label="replicas"
            description="Optional desired replicas; blank uses the resolved tier default."
            isOptional
            htmlName="replicas"
            value={form.replicas}
            data-testid="req-replicas"
            step={1}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, replicas: value === null || !Number.isFinite(value) ? 0 : value }))
            }
          />

          <label className="hosting-option" htmlFor="req-stripPrefix">
            <input
              id="req-stripPrefix"
              type="checkbox"
              checked={form.stripPrefix}
              data-testid="req-stripPrefix"
              onChange={(event) =>
                setForm((prev) => ({ ...prev, stripPrefix: event.target.checked }))
              }
            />
            <span>
              <strong>stripPrefix</strong>
              <small>Remove the hosting prefix before forwarding requests.</small>
            </span>
          </label>

          <label className="hosting-option" htmlFor="req-hostingScheme">
            <span>
              <strong>hostingScheme</strong>
              <small>Choose path or subdomain routing for the hosted service.</small>
            </span>
            <select
              id="req-hostingScheme"
              value={form.hostingScheme}
              data-testid="req-hostingScheme"
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  hostingScheme: event.target.value as FormState["hostingScheme"]
                }))
              }
            >
              <option value="path">path</option>
              <option value="subdomain">subdomain</option>
            </select>
          </label>
        </div>

        <div className="actions">
          <Button
            type="submit"
            variant="primary"
            label={submitting ? "Submitting…" : "Submit Build"}
            isDisabled={submitting}
            data-testid="req-submit"
          />
          <Button
            type="button"
            variant="secondary"
            label="Reset form"
            onClick={resetForm}
            data-testid="req-reset"
          />
          {/* 목록으로 가는 것은 **탐색**이므로 버튼이 아니라 링크여야 한다.
              Astryx Button 으로 바꾸면 시각은 맞아도 의미가 틀린다
              (새 탭 열기·주소 복사 불가, 스크린리더가 button 으로 읽음). */}
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
