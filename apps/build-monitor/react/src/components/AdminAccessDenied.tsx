// TASK-097: AdminAccessDenied (React).
//
// Svelte src/components/AdminAccessDenied.svelte 와 1:1 정합. TASK-084 의
// deep link UX — 비-admin user 가 /admin/* deep link 진입 시 친절한 권한
// 없음 패널.
//
// reason 별 메시지:
//   - NO_USER: helper 가 NO_USER 로 거부 — 사실상 페이지 도달 불가이지만
//     안전을 위해 표시.
//   - FORBIDDEN: backend 가 401/403 으로 caller 의 admin 미허용 확인.
//     가장 흔한 deep link 케이스.
//   - NOT_IN_ALLOW_LIST: backend 가 allow-list 를 알려줬지만 caller 가
//     거기 없음.
//
// 디자인 토큰: --dib-color-accent-danger / --dib-color-text-muted /
// --dib-color-bg-surface / --dib-color-bg-canvas / --dib-color-border-subtle /
// --dib-color-border-strong / --dib-color-text-primary /
// --dib-color-bg-surface-elevated / --dib-color-accent-primary /
// --dib-color-accent-primary-hover / --dib-shadow-modal / --dib-shadow-glow /
// --dib-radius-lg / --dib-radius-md / --dib-radius-sm / --dib-space-xs / --dib-space-sm /
// --dib-space-md / --dib-space-lg / --dib-space-xl / --dib-space-xxl /
// --dib-size-xs / --dib-size-sm / --dib-size-md / --dib-size-xxl /
// --dib-motion-duration-fast / --dib-motion-duration-slow /
// --dib-motion-easing-standard.
//
// AdminGuard test mock 호환성 — ensureAdminAccess 가 반환하는 reason
// union ("NO_USER" | "FORBIDDEN" | "NOT_IN_ALLOW_LIST") 그대로 type import.

import { useNavigate } from "react-router-dom";
import type { CSSProperties, ReactElement } from "react";

import { setUserId } from "@/lib/useUserId";

import "./AdminAccessDenied.css";

type DenyReason = "NO_USER" | "FORBIDDEN" | "NOT_IN_ALLOW_LIST";

export function AdminAccessDenied({
  userId,
  reason
}: {
  userId: string | null;
  reason: DenyReason;
}): ReactElement {
  const navigate = useNavigate();

  const headline =
    reason === "NO_USER"
      ? "Sign in required"
      : reason === "FORBIDDEN"
        ? "Admin access required"
        : "Admin access required";

  let bodyMessage: string;
  if (reason === "NO_USER") {
    bodyMessage = "Please sign in to view this page.";
  } else {
    const handle = userId ? `@${userId}` : "Your account";
    if (reason === "FORBIDDEN") {
      bodyMessage = `${handle} is not authorized to view admin sections.`;
    } else {
      bodyMessage = `${handle} is not on the current admin allow-list. Ask an existing admin to add you, or sign in with a different user id.`;
    }
  }

  function switchUser(): void {
    setUserId(null);
    navigate("/");
  }

  // fadeIn animation — globals.css 의 keyframe 와 동일.
  const pageStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--dib-space-xxl)",
    animation: "fadeIn var(--dib-motion-duration-slow) var(--dib-motion-easing-standard)"
  };

  return (
    <section className="admin-denied-page" style={pageStyle}>
      <header className="admin-denied-head">
        <div>
          <h1>🔒 {headline}</h1>
          <p className="admin-denied-muted">{bodyMessage}</p>
        </div>
      </header>

      <div className="admin-denied-card">
        <p className="admin-denied-card-body">
          {userId
            ? `You are currently signed in as `
            : "You are not signed in."}
          {userId ? <code className="mono">@{userId}</code> : null}
          {userId ? "." : null}
          <br />
          Admin sections are reserved for users in the Build Server's
          <code>ADMIN_IDS</code> allow-list.
        </p>

        <div className="admin-denied-actions">
          <button
            type="button"
            className="admin-denied-btn-primary"
            data-testid="admin-denied-go-builds"
            onClick={() => {
              navigate("/builds");
            }}
          >
            Back to Builds
          </button>
          <button
            type="button"
            className="admin-denied-btn-secondary"
            data-testid="admin-denied-switch-user"
            onClick={switchUser}
          >
            Switch user
          </button>
        </div>
      </div>
    </section>
  );
}
