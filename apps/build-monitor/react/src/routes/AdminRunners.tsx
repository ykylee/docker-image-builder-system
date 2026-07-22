// TASK-098: AdminRunners (React) — /admin/runners React 마이그레이션.
//
// Svelte src/routes/AdminRunners.svelte 와 의미상 1:1 정합. TASK-069 +
// TASK-076 의 runner registry 관리 + TASK-077 의 RegisterRunnerModal
// (React 측 port) 통합.
//
// React 측 RegisterRunnerModal 는 Svelte RegisterRunnerModal.svelte 와
// 1:1 정합. POST /admin/runners (TASK-077). 본 TASK 에서 함께 port.

import { Suspense, lazy, useEffect, useMemo, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { AdminTabs } from "@/components/AdminTabs";
import { FilterChips } from "@/components/FilterChips";
import { StatusPill } from "@/components/StatusPill";

// TASK-137: 모달을 지연 로드한다.
//
// RegisterRunnerModal 이 Astryx `Dialog` 로 바뀌면서 오버레이 기계장치
// (Layer / 포커스 트랩 / 위치 계산)를 끌고 들어온다. 정적 import 로 두면
// **`/login` 만 여는 일반 사용자까지** 그 비용을 초기 번들로 내려받는다 —
// admin 이 "Register Runner" 를 누를 때만 필요한 코드인데도.
//
// 이미 조건부 렌더(`registerModalOpen ? ... : null`)라 지연 로드와 자연스럽게
// 맞는다. 실측: 초기 JS gzip **142.57 → 104.30KB**, 분리된 모달 청크가
// gzip 38.21KB (admin 이 모달을 열 때만 내려받는다).
const RegisterRunnerModal = lazy(async () => {
  const mod = await import("@/components/RegisterRunnerModal");
  return { default: mod.RegisterRunnerModal };
});
import {
  deleteAdminRunner,
  listAdminRunners,
  type AdminRunner
} from "@/lib/api";
import { ensureAdminAccess } from "@/lib/admin-guard";
import { useUserId } from "@/lib/useUserId";

import "./AdminRunners.css";

type RunnerFilter = "ALL" | "ACTIVE" | "DISABLED";

export function AdminRunners(): ReactElement {
  const [userId] = useUserId();
  const navigate = useNavigate();
  const [runners, setRunners] = useState<AdminRunner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RunnerFilter>("ALL");
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [accessDenied, setAccessDenied] = useState<
    null | { reason: "NO_USER" | "FORBIDDEN" | "NOT_IN_ALLOW_LIST" }
  >(null);

  async function refresh(): Promise<void> {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listAdminRunners(userId);
      setRunners(result.runners);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      navigate("/");
      return;
    }
    let cancelled = false;
    (async () => {
      const guard = await ensureAdminAccess(userId);
      if (cancelled) return;
      if (!guard.isAdmin) {
        setAccessDenied({ reason: guard.reason });
        setLoading(false);
        return;
      }
      try {
        if (cancelled) return;
        const result = await listAdminRunners(userId);
        if (cancelled) return;
        setRunners(result.runners);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function remove(target: string): Promise<void> {
    if (!userId) return;
    setBusyId(target);
    setError(null);
    try {
      await deleteAdminRunner(userId, target);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  const visible = useMemo(
    () =>
      filter === "ALL"
        ? runners
        : runners.filter((r) => r.status === filter),
    [runners, filter]
  );

  if (accessDenied) {
    return (
      <AdminAccessDenied userId={userId} reason={accessDenied.reason} />
    );
  }

  return (
    <section className="admin-runners-page" data-testid="admin-runners">
      <AdminTabs />

      <header className="admin-runners-head">
        <div>
          <h1>Runners</h1>
          <p className="muted">
            {runners.length} runner{runners.length === 1 ? "" : "s"} registered
          </p>
        </div>
        <div className="admin-runners-actions">
          <FilterChips
            options={["ALL", "ACTIVE", "DISABLED"]}
            selected={filter}
            onSelect={(v) => {
              setFilter(v);
            }}
            ariaLabel="Runner status filter"
          />
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setRegisterModalOpen(true);
            }}
            data-testid="admin-runners-register"
            // TASK-148: B층 가드(check-theme-contrast, check-css-leak)가 이
            // 어트리뷰트로 모달을 자동으로 열어 오버레이(모달 내부)까지 감사.
            // 트리거 이름은 가드 MODAL_TRIGGERS 의 `name` 과 일치해야 한다.
            data-open-modal="register-runner"
          >
            + Register Runner
          </button>
        </div>
      </header>

      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="muted">No runners.</p>
      ) : (
        <table className="admin-runners-table">
          <thead>
            <tr>
              <th>Runner id</th>
              <th>Status</th>
              <th className="r">Claims</th>
              <th className="r">Last seen</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.runnerId} data-testid={`admin-runners-row-${r.runnerId}`}>
                <td className="mono">{r.runnerId}</td>
                <td>
                  <StatusPill status={r.status} />
                </td>
                <td className="r">{r.claimsCount}</td>
                <td className="r">
                  {r.lastSeenAt
                    ? new Date(r.lastSeenAt).toLocaleString()
                    : "—"}
                </td>
                <td className="r">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      void remove(r.runnerId);
                    }}
                    disabled={busyId === r.runnerId}
                    data-testid={`admin-runners-delete-${r.runnerId}`}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {registerModalOpen ? (
        // fallback 은 null — 모달 청크는 작고, 로딩 표시가 깜빡이면 오히려
        // 산만하다. 실패 시에는 상위 ErrorBoundary 가 받는다.
        <Suspense fallback={null}>
        <RegisterRunnerModal
          open={registerModalOpen}
          onClose={() => {
            setRegisterModalOpen(false);
          }}
          onSuccess={() => {
            setRegisterModalOpen(false);
            void refresh();
          }}
          callerId={userId}
        />
        </Suspense>
      ) : null}
    </section>
  );
}
