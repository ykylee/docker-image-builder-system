// TASK-098: RegisterRunnerModal (React) — admin UI 의 "Register Runner" modal.
//
// Svelte src/components/RegisterRunnerModal.svelte 와 의미상 1:1 정합.
// TASK-077 의 pre-registration UX. POST /admin/runners 호출.
//
// React 측 api.ts 에는 아직 createAdminRunner helper 가 부재 — 본 TASK
// 에서 inline 호출. TASK-099 follow-up 에서 helper 분리 검토.

import { useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";

import { api } from "@/lib/api";

import "./RegisterRunnerModal.css";

export function RegisterRunnerModal({
  open,
  onClose,
  onSuccess,
  callerId
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  callerId: string | null;
}): ReactElement | null {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // focus input on open
    const t = setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => {
      clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeydown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => {
      window.removeEventListener("keydown", onKeydown);
    };
  }, [open, onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!callerId) {
      setError("401: Admin id missing — Login required.");
      return;
    }
    const trimmed = inputRef.current?.value.trim() ?? "";
    if (trimmed === "") {
      setError("runnerId is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fn = (api as unknown as Record<string, (p: string, init: unknown) => Promise<unknown>>).POST;
      await fn("/admin/runners", {
        headers: { "X-Admin-Id": callerId },
        body: { runnerId: trimmed }
      });
      onSuccess();
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  function handleBackdropClick(
    event: React.MouseEvent<HTMLDivElement>
  ): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      tabIndex={-1}
      aria-modal="true"
      aria-labelledby="register-runner-title"
      onClick={handleBackdropClick}
      data-testid="register-runner-modal"
    >
      <div className="modal">
        <header className="modal-header">
          <h2 id="register-runner-title">Register Runner</h2>
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="modal-body">
            <p className="modal-help">
              Pre-register a runner so it appears in the admin registry
              before the runner process boots. The runner record starts as
              ACTIVE; once the runner actually starts and self-registers on
              its first claim, the existing self-register refreshes the
              timestamp without changing status.
            </p>
            <p className="modal-help">
              The <code>runnerId</code> must match the <code>RUNNER_ID</code>{" "}
              env the runner process boots with — otherwise the runner&apos;s
              first claim will be rejected.
            </p>
            <label className="modal-field">
              <span className="modal-label">runnerId</span>
              <input
                ref={inputRef}
                type="text"
                name="runnerId"
                required
                disabled={submitting}
                placeholder="runner-cluster-prod-1"
                data-testid="register-runner-input"
              />
            </label>
            {error ? (
              <p
                className="modal-error"
                role="alert"
                data-testid="register-runner-error"
              >
                {error}
              </p>
            ) : null}
          </div>
          <footer className="modal-footer">
            <button
              type="button"
              className="btn-secondary"
              disabled={submitting}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
              data-testid="register-runner-submit"
            >
              {submitting ? "Registering…" : "Register"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
