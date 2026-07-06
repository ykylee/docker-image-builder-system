<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { userIdStore } from "../lib/session.js";
  import {
    submitBuildRequest,
    type BuildRequestPayload,
    type BuildRequestResponse,
    type BuildAcceptedResponse,
    type BuildDuplicateResponse
  } from "../lib/api";

  // TASK-079 (skill 측 build request UI): 사용자가 build server 의
  // BuildRequest schema (skill → host) 를 직접 채워서 POST /builds 를 호출할
  // 수 있는 페이지. 사전 컴파일된 build-server (memory backend) 의 환경에서
  // 한두 번 클릭으로 build lifecycle 전체를 관찰할 수 있도록 한다.
  //
  // 동작 모드:
  //   - login 직후 redirect 되어 진입. userId 는 session.ts store 에서 가져옴.
  //   - userId 가 없으면 Login 페이지(`/`) 로 redirect.
  //   - payload 가 zod schema 와 일치해야 backend 가 202 (accepted) 또는 409
  //     (duplicate) 를 반환. invalid payload 는 zod 가 500 으로 reject.
  //
  // 표준 검증 시나리오 (시뮬레이션):
  //   1) preset "Hello World" → "Submit Build" 클릭 → accepted toast + 결과 패널
  //   2) 같은 appName 으로 즉시 재시도 → duplicate 배너 + 기존 build 표시
  //   3) "Random appName" 클릭 → 다른 appName 으로 payload 갱신 후 submit

  let userId = $derived($userIdStore);
  let loading = $state(true);

  // form fields. default 값은 preset 에서 일괄 교체.
  let appName = $state("");
  let requestedBy = $state("");
  let objectKey = $state("");
  let checksumSha256 = $state("");
  let sizeBytes = $state(0);
  let entrypointPath = $state("src/index.ts");
  let dockerfilePath = $state("Dockerfile");
  let previewTtlMinutes = $state(30);

  let submitting = $state(false);
  let submitError = $state<string | null>(null);

  // 가장 최근 응답을 화면에 표시. accepted/duplicate 둘 다.
  let lastResult = $state<BuildRequestResponse | null>(null);

  // preset 정의 — 한두 번 클릭으로 schema 검증 끝낼 수 있도록.
  // checksum 은 placeholder 형식 (64 hex chars). 실제 Skill 이 발행한 값은
  // 아니지만 backend 의 zod schema 가 min(1) 만 검사하므로 테스트 통과.
  function applyPreset(kind: "hello" | "minimal" | "typescript") {
    const ts = Date.now().toString(36);
    if (kind === "hello") {
      appName = `hello-${ts}`;
      requestedBy = userId ?? "alice";
      objectKey = `ref://github.com/example/hello-world`;
      checksumSha256 = "0".repeat(64);
      sizeBytes = 12345;
      entrypointPath = "src/index.ts";
      dockerfilePath = "Dockerfile";
      previewTtlMinutes = 30;
    } else if (kind === "minimal") {
      appName = `minimal-${ts}`;
      requestedBy = userId ?? "alice";
      objectKey = `ref://github.com/example/minimal`;
      checksumSha256 = "0".repeat(64);
      sizeBytes = 4096;
      entrypointPath = "main.py";
      dockerfilePath = "Dockerfile";
      previewTtlMinutes = 15;
    } else {
      appName = `ts-app-${ts}`;
      requestedBy = userId ?? "alice";
      objectKey = `ref://github.com/example/ts-app`;
      checksumSha256 = "0".repeat(64);
      sizeBytes = 102400;
      entrypointPath = "src/server.ts";
      dockerfilePath = "Dockerfile";
      previewTtlMinutes = 60;
    }
  }

  function randomizeAppName() {
    const ts = Date.now().toString(36);
    const rnd = Math.random().toString(36).slice(2, 6);
    appName = `random-${ts}-${rnd}`;
  }

  onMount(async () => {
    // userId 가 없으면 Login 페이지로 redirect (다른 인증 필요 route 와 동일).
    if (!userId) {
      loading = false;
      push("/");
      return;
    }
    // userId 로 default requestedBy 미리 채움.
    requestedBy = userId;
    // 첫 진입 시 default preset 으로 form 초기화.
    applyPreset("hello");
    loading = false;
  });

  async function submit() {
    submitError = null;
    lastResult = null;
    // form validation — zod 가 backend 에서도 검증하지만 client-side sanity
    // check 로 빠르게 피드백. BuildRequest schema 그대로.
    if (!appName || appName.length < 1) {
      submitError = "appName is required (BuildRequest schema)";
      return;
    }
    if (!requestedBy || requestedBy.length < 1) {
      submitError = "requestedBy is required";
      return;
    }
    if (!objectKey || objectKey.length < 1) {
      submitError = "sourceArchive.objectKey is required";
      return;
    }
    if (!checksumSha256 || checksumSha256.length < 1) {
      submitError = "sourceArchive.checksumSha256 is required";
      return;
    }
    if (sizeBytes < 0 || !Number.isFinite(sizeBytes)) {
      submitError = "sourceArchive.sizeBytes must be a non-negative integer";
      return;
    }
    if (!entrypointPath || entrypointPath.length < 1) {
      submitError = "entrypointPath is required";
      return;
    }

    submitting = true;
    try {
      // BuildRequest schema 의 `metadata` 필드는 zod default({}) 가 있어
      // backend 에서 optional 이지만, .generated/openapi.d.ts 의 components
      // alias 가 required 로 잡힘 (openapi-typescript 의 default 추론
      // 한계). 빈 객체로 명시 — payload 가 너무 단순하면 type-cast 로
      // 우회하지만 metadata 도 함께 보내는 편이 schema 와 더 잘 맞음.
      const payload: BuildRequestPayload = {
        appName,
        requestedBy,
        sourceArchive: { objectKey, checksumSha256, sizeBytes: Math.trunc(sizeBytes) },
        entrypointPath,
        dockerfilePath,
        previewTtlMinutes,
        metadata: {}
      };
      lastResult = await submitBuildRequest(payload);
    } catch (e) {
      submitError = e instanceof Error ? e.message : String(e);
    } finally {
      submitting = false;
    }
  }

  // 빌드 detail 페이지로 이동 — accepted result 의 buildId 사용.
  function openBuildDetail(buildId: string) {
    push(`/builds/${buildId}`);
  }

  // 결과 분류 helper.
  function isAccepted(r: BuildRequestResponse | null): r is BuildAcceptedResponse {
    return !!r && r.accepted === true && r.duplicate === false;
  }
  function isDuplicate(r: BuildRequestResponse | null): r is BuildDuplicateResponse {
    return !!r && r.accepted === false && r.duplicate === true;
  }
</script>

<section class="page">
  <header class="page-head">
    <div>
      <h1>Build Request</h1>
      <p class="muted">
        Skill → Host 의 <code>POST /builds</code> payload 를 직접 작성하여 제출합니다.
        응답은 build server 의 <code>BuildAcceptedResponse</code> (HTTP 202) 또는
        <code>BuildDuplicateResponse</code> (HTTP 409) 중 하나로 옵니다.
      </p>
    </div>
  </header>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else}
    <div class="presets">
      <span class="label">Preset:</span>
      <button type="button" class="preset-btn" onclick={() => applyPreset("hello")}>
        Hello World
      </button>
      <button type="button" class="preset-btn" onclick={() => applyPreset("minimal")}>
        Minimal (Python)
      </button>
      <button type="button" class="preset-btn" onclick={() => applyPreset("typescript")}>
        TypeScript
      </button>
      <button type="button" class="preset-btn secondary" onclick={randomizeAppName}>
        ↻ Random appName
      </button>
    </div>

    <form class="form" onsubmit={(e) => { e.preventDefault(); submit(); }}>
      <div class="grid">
        <label>
          <span class="lbl">appName <em>*</em></span>
          <input type="text" bind:value={appName} placeholder="hello-world" data-testid="req-appName" />
          <small class="hint">Canonical app identity. Active-build lock key.</small>
        </label>

        <label>
          <span class="lbl">requestedBy <em>*</em></span>
          <input type="text" bind:value={requestedBy} placeholder="alice" data-testid="req-requestedBy" />
          <small class="hint">Owner userId. 같은 값으로 build list filter 가능.</small>
        </label>

        <label>
          <span class="lbl">sourceArchive.objectKey <em>*</em></span>
          <input type="text" bind:value={objectKey} placeholder="ref://github.com/owner/repo" data-testid="req-objectKey" />
          <small class="hint">Skill 이 발행한 archive reference.</small>
        </label>

        <label>
          <span class="lbl">sourceArchive.checksumSha256 <em>*</em></span>
          <input type="text" bind:value={checksumSha256} placeholder="0..0 (64 hex)" data-testid="req-checksum" />
          <small class="hint">실제 upload 시 server 가 검증. zod 는 min(1) 만 검사.</small>
        </label>

        <label>
          <span class="lbl">sourceArchive.sizeBytes <em>*</em></span>
          <input
            type="number"
            min="0"
            step="1"
            bind:value={sizeBytes}
            data-testid="req-sizeBytes"
          />
          <small class="hint">Archive byte size. non-negative.</small>
        </label>

        <label>
          <span class="lbl">entrypointPath <em>*</em></span>
          <input type="text" bind:value={entrypointPath} placeholder="src/index.ts" data-testid="req-entrypoint" />
          <small class="hint">Container 시작점.</small>
        </label>

        <label>
          <span class="lbl">dockerfilePath</span>
          <input type="text" bind:value={dockerfilePath} placeholder="Dockerfile" data-testid="req-dockerfile" />
          <small class="hint">Default <code>Dockerfile</code>.</small>
        </label>

        <label>
          <span class="lbl">previewTtlMinutes</span>
          <input type="number" min="1" step="1" bind:value={previewTtlMinutes} data-testid="req-ttl" />
          <small class="hint">Preview container TTL.</small>
        </label>
      </div>

      <div class="actions">
        <button type="submit" class="btn-primary" disabled={submitting} data-testid="req-submit">
          {submitting ? "Submitting…" : "Submit Build"}
        </button>
        <button type="button" class="btn-secondary" onclick={() => push("/builds")} data-testid="req-cancel">
          View Builds list
        </button>
      </div>
    </form>

    {#if submitError}
      <div class="banner error" role="alert" data-testid="req-error">
        <strong>Submit failed</strong>
        <pre>{submitError}</pre>
      </div>
    {/if}

    {#if lastResult}
      <section class="result" data-testid="req-result">
        {#if isAccepted(lastResult)}
          <header class="result-head accepted">
            <span class="badge">202 Accepted</span>
            <h2>Build queued</h2>
          </header>
          <p>
            <code>appName={lastResult.build.appName}</code> 로 새 build 가 QUEUED 상태로 등록됨.
            build server 가 <code>REQUEST_ACCEPTED</code> phase 로 전이.
          </p>
          <dl class="kv">
            <dt>buildId</dt>
            <dd class="mono">{lastResult.build.buildId}</dd>
            <dt>status</dt>
            <dd><span class="chip status-{lastResult.build.status.toLowerCase()}">{lastResult.build.status}</span></dd>
            <dt>phase</dt>
            <dd class="mono">{lastResult.build.phase}</dd>
            <dt>createdAt</dt>
            <dd class="mono">{lastResult.build.createdAt}</dd>
          </dl>
          <div class="actions">
            <button type="button" class="btn-primary" onclick={() => openBuildDetail(lastResult!.build.buildId)} data-testid="req-open-detail">
              Open Build Detail →
            </button>
            <button type="button" class="btn-secondary" onclick={() => push("/builds")}>
              Back to list
            </button>
          </div>
        {:else if isDuplicate(lastResult)}
          <header class="result-head duplicate">
            <span class="badge">409 Duplicate</span>
            <h2>Active build already exists</h2>
          </header>
          <p>
            <code>appName={lastResult.build.appName}</code> 에 대해 active build 가 이미 존재.
            reason: <strong>{lastResult.reason}</strong>. 기존 build 가 그대로 유지됨.
          </p>
          <dl class="kv">
            <dt>buildId</dt>
            <dd class="mono">{lastResult.build.buildId}</dd>
            <dt>status</dt>
            <dd><span class="chip status-{lastResult.build.status.toLowerCase()}">{lastResult.build.status}</span></dd>
            <dt>phase</dt>
            <dd class="mono">{lastResult.build.phase}</dd>
          </dl>
          <div class="actions">
            <button type="button" class="btn-primary" onclick={() => openBuildDetail(lastResult!.build.buildId)} data-testid="req-open-existing">
              Open existing Build →
            </button>
            <button type="button" class="btn-secondary" onclick={randomizeAppName}>
              Try different appName
            </button>
          </div>
        {/if}
      </section>
    {/if}

    <details class="raw-payload">
      <summary>Raw payload preview (JSON)</summary>
      <pre>{JSON.stringify({
        appName,
        requestedBy,
        sourceArchive: { objectKey, checksumSha256, sizeBytes },
        entrypointPath,
        dockerfilePath,
        previewTtlMinutes
      }, null, 2)}</pre>
    </details>
  {/if}
</section>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    animation: fadeIn var(--motion-duration-slow) var(--motion-easing-standard);
    max-width: 960px;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
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
    line-height: var(--motion-duration-base);
  }
  .muted { color: var(--color-text-muted); }

  .presets {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
    padding: var(--space-md);
    background: var(--color-bg-surface);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
  }
  .presets .label {
    font-size: var(--size-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-secondary);
  }
  .preset-btn {
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    background: var(--color-bg-surface-elevated);
    color: var(--color-text-primary);
    font-size: var(--size-sm);
    font-weight: var(--weight-medium);
    border: 1px solid var(--color-border-subtle);
    cursor: pointer;
    transition: all var(--motion-duration-fast) var(--motion-easing-standard);
  }
  .preset-btn:hover {
    background: var(--color-accent-primary);
    color: white;
    border-color: var(--color-accent-primary);
  }
  .preset-btn.secondary {
    background: transparent;
    color: var(--color-text-secondary);
  }

  .form {
    background: var(--color-bg-surface);
    padding: var(--space-lg);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-subtle);
    box-shadow: var(--shadow-card);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
  }
  @media (max-width: 640px) {
    .grid { grid-template-columns: 1fr; }
  }
  label {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  label .lbl {
    font-size: var(--size-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-secondary);
  }
  label .lbl em {
    color: var(--color-accent-danger);
    font-style: normal;
    margin-left: 2px;
  }
  input[type="text"], input[type="number"] {
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-default);
    background: var(--color-bg-surface-elevated);
    color: var(--color-text-primary);
    font-family: var(--font-mono, monospace);
    font-size: var(--size-sm);
    transition: border-color var(--motion-duration-fast) var(--motion-easing-standard);
  }
  input:focus {
    outline: none;
    border-color: var(--color-accent-primary);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
  }
  .hint {
    color: var(--color-text-muted);
    font-size: var(--size-xs);
  }
  .hint code {
    background: var(--color-bg-surface-elevated);
    padding: 0 4px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono, monospace);
  }

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
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
  }
  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(99, 102, 241, 0.5);
  }
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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

  .banner {
    padding: var(--space-md) var(--space-lg);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
    background: var(--color-bg-surface);
  }
  .banner.error {
    border-color: var(--color-accent-danger);
    background: rgba(244, 63, 94, 0.08);
  }
  .banner pre {
    margin: var(--space-sm) 0 0;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--color-text-primary);
    font-family: var(--font-mono, monospace);
    font-size: var(--size-sm);
  }

  .result {
    background: var(--color-bg-surface);
    padding: var(--space-lg);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-subtle);
    box-shadow: var(--shadow-card);
  }
  .result-head {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }
  .result-head h2 {
    margin: 0;
    font-size: var(--size-lg);
    font-weight: var(--weight-semibold);
  }
  .result-head.accepted { color: var(--color-accent-success, #22c55e); }
  .result-head.duplicate { color: var(--color-accent-warning, #f59e0b); }
  .badge {
    display: inline-block;
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-pill);
    font-family: var(--font-mono, monospace);
    font-size: var(--size-xs);
    font-weight: var(--weight-semibold);
    color: white;
  }
  .result-head.accepted .badge { background: var(--color-accent-success, #22c55e); }
  .result-head.duplicate .badge { background: var(--color-accent-warning, #f59e0b); }

  .kv {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: var(--space-sm) var(--space-md);
    margin: var(--space-md) 0;
    padding: var(--space-md);
    background: var(--color-bg-surface-elevated);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
  }
  .kv dt {
    font-size: var(--size-xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    align-self: center;
  }
  .kv dd {
    margin: 0;
    color: var(--color-text-primary);
    font-family: var(--font-mono, monospace);
    font-size: var(--size-sm);
    word-break: break-all;
  }
  .kv dd.mono { font-family: var(--font-mono, monospace); }
  .chip {
    display: inline-block;
    padding: 2px var(--space-sm);
    border-radius: var(--radius-pill);
    font-family: var(--font-mono, monospace);
    font-size: var(--size-xs);
    font-weight: var(--weight-semibold);
    color: white;
  }
  .chip.status-queued { background: var(--color-text-muted); }
  .chip.status-building { background: var(--color-accent-info, #3b82f6); }
  .chip.status-completed { background: var(--color-accent-success, #22c55e); }
  .chip.status-failed { background: var(--color-accent-danger, #ef4444); }

  .raw-payload {
    margin-top: var(--space-md);
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-md);
  }
  .raw-payload summary {
    cursor: pointer;
    font-size: var(--size-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text-secondary);
  }
  .raw-payload pre {
    margin-top: var(--space-md);
    padding: var(--space-md);
    background: var(--color-bg-surface-elevated);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono, monospace);
    font-size: var(--size-xs);
    color: var(--color-text-primary);
    overflow-x: auto;
  }
</style>