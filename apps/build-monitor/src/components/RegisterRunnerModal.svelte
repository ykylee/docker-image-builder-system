<script lang="ts">
  /**
   * RegisterRunnerModal — admin UI 의 "Register Runner" 버튼이 띄우는 modal.
   *
   * TASK-077: 운영자가 신규 cluster / k8s pod / EC2 instance 에서 runner 를
   * 띄우기 전에, 그 runner 가 곧 들어온다는 것을 admin UI 에 미리 등록할 수
   * 있다. Pre-registration 된 runner record 는 status=ACTIVE + firstSeenAt=now()
   * + lastSeenAt=now() 로 placeholder 생성되며, 그 runner 가 실제 띄워져
   * 첫 claim 을 보내면 기존 self-register 가 counter / currentBuildId 만
   * 갱신한다 (seamless 통합). 같은 runnerId 로 두 번 호출 시 409.
   *
   * UX 규약:
   * - 입력은 `runnerId` 하나. 운영자가 이 runner 의 RUNNER_ID env 와 동일하게
   *   입력해야 한다 — 다르면 그 runner 의 첫 claim 이 mismatched-id 로
   *   거절된다 (build-service 가 RUNNER_ID 검증).
   * - 성공시 (201) modal 자동 close + AdminRunners 페이지 refresh. 실패시
   *   (400/401/403/409) modal 은 닫히지 않고 inline error 표시 — 운영자가
   *   같은 입력으로 즉시 retry 가능.
   * - Enter 키는 form submit, Escape 키는 modal close (focus 가 input 안에
   *   있을 때만). Modal 외부 click 도 close (UX 표준).
   *
   * Accessibility:
   * - role="dialog" + aria-modal="true" + aria-labelledby 로 screen reader
   *   지원.
   * - input focus trap (autofocus on mount).
   */
  import { onMount, tick } from "svelte";
  import {
    createAdminRunner,
    type AdminRunnerRegisterRequest
  } from "../lib/api.js";
  import { userIdStore } from "../lib/session.js";

  let userId = $derived($userIdStore);

  // 부모가 토글 — open=true 면 modal visible, false 면 hidden. 부모가
  // onSuccess() 로 close 요청 시 false 로 set. submit 성공시 onSuccess
  // 호출 + close. Svelte 5 의 $props() 는 1 회만 호출 가능 — 두 prop 을
  // destructure 로 한꺼번에 받음.
  let {
    open = $bindable(false),
    onSuccess = undefined
  }: {
    open?: boolean;
    onSuccess?: () => void;
  } = $props();

  let runnerIdInput: HTMLInputElement | null = $state(null);
  let submitting = $state(false);
  let error = $state<string | null>(null);

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (!userId) {
      error = "401: Admin id missing — Login required.";
      return;
    }
    const trimmed = (runnerIdInput?.value ?? "").trim();
    if (trimmed === "") {
      error = "runnerId is required.";
      return;
    }
    submitting = true;
    error = null;
    try {
      const body: AdminRunnerRegisterRequest = { runnerId: trimmed };
      await createAdminRunner(userId, body);
      onSuccess?.();
      // parent 가 onSuccess 후 open=false 로 set 해주는 게 정석이지만,
      // 부모가 set 안 할 경우 fallback 으로 close.
      open = false;
      // Reset input for next open.
      if (runnerIdInput) runnerIdInput.value = "";
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      submitting = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      open = false;
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      open = false;
    }
  }

  $effect(() => {
    if (open) {
      // focus trap — open 시 input 에 auto focus. tick() 으로 DOM commit 후
      // focus 가 mount 보장.
      tick().then(() => {
        runnerIdInput?.focus();
      });
    }
  });

  onMount(() => {
    // global Escape key listener — modal 외부에서 trigger 되지 않도록
    // open 일 때만 active. $effect 로 제어하면 reactive 가 깔끔.
  });
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
  <div
    class="modal-backdrop"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="register-runner-title"
    onclick={handleBackdropClick}
  >
    <div class="modal" data-testid="register-runner-modal">
      <header class="modal-header">
        <h2 id="register-runner-title">Register Runner</h2>
        <button
          type="button"
          class="modal-close"
          aria-label="Close"
          onclick={() => (open = false)}
        >
          ×
        </button>
      </header>
      <form onsubmit={handleSubmit}>
        <div class="modal-body">
          <p class="modal-help">
            Pre-register a runner so it appears in the admin registry
            before the runner process boots. The runner record starts as
            ACTIVE; once the runner actually starts and self-registers on
            its first claim, the existing self-register refreshes the
            timestamp without changing status.
          </p>
          <p class="modal-help">
            The <code>runnerId</code> must match the <code>RUNNER_ID</code>
            env the runner process boots with — otherwise the runner's
            first claim will be rejected.
          </p>
          <label class="modal-field">
            <span class="modal-label">runnerId</span>
            <input
              bind:this={runnerIdInput}
              type="text"
              name="runnerId"
              required
              disabled={submitting}
              placeholder="runner-cluster-prod-1"
              data-testid="register-runner-input"
            />
          </label>
          {#if error}
            <p class="modal-error" role="alert" data-testid="register-runner-error">
              {error}
            </p>
          {/if}
        </div>
        <footer class="modal-footer">
          <button
            type="button"
            class="btn-secondary"
            disabled={submitting}
            onclick={() => (open = false)}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn-primary"
            disabled={submitting}
            data-testid="register-runner-submit"
          >
            {submitting ? "Registering…" : "Register"}
          </button>
        </footer>
      </form>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .modal {
    background: var(--color-bg-elevated, #1e1e1e);
    color: var(--color-text, #f0f0f0);
    border-radius: var(--radius-md, 6px);
    box-shadow: var(--shadow-modal, 0 8px 32px rgba(0, 0, 0, 0.5));
    width: min(480px, 92vw);
    max-height: 80vh;
    overflow: auto;
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--color-border, #333);
  }
  .modal-header h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .modal-close {
    background: transparent;
    border: 0;
    color: var(--color-text-muted, #aaa);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0 0.25rem;
  }
  .modal-close:hover {
    color: var(--color-text, #f0f0f0);
  }
  .modal-body {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .modal-help {
    margin: 0;
    font-size: 0.9rem;
    color: var(--color-text-muted, #aaa);
    line-height: 1.4;
  }
  .modal-field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .modal-label {
    font-size: 0.85rem;
    color: var(--color-text-muted, #aaa);
    font-family: monospace;
  }
  .modal-field input {
    padding: 0.5rem 0.7rem;
    background: var(--color-bg-input, #2a2a2a);
    border: 1px solid var(--color-border, #444);
    border-radius: 4px;
    color: var(--color-text, #f0f0f0);
    font-family: monospace;
  }
  .modal-field input:focus {
    outline: none;
    border-color: var(--color-accent-primary, #5b8def);
  }
  .modal-field input:disabled {
    opacity: 0.6;
  }
  .modal-error {
    margin: 0;
    padding: 0.6rem 0.8rem;
    background: rgba(220, 80, 80, 0.15);
    border: 1px solid var(--color-accent-danger, #c85050);
    border-radius: 4px;
    color: var(--color-accent-danger, #ff8080);
    font-size: 0.85rem;
    font-family: monospace;
  }
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 0.85rem 1.25rem;
    border-top: 1px solid var(--color-border, #333);
  }
  .btn-primary,
  .btn-secondary {
    padding: 0.5rem 1.1rem;
    border-radius: 4px;
    border: 0;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .btn-primary {
    background: var(--color-accent-primary, #5b8def);
    color: white;
  }
  .btn-primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }
  .btn-primary:disabled,
  .btn-secondary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .btn-secondary {
    background: var(--color-bg-input, #2a2a2a);
    color: var(--color-text, #f0f0f0);
    border: 1px solid var(--color-border, #444);
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--color-border, #333);
  }
</style>