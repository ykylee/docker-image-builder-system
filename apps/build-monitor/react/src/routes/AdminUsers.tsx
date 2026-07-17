// TASK-098: AdminUsers (React) — /admin/users React 마이그레이션.
//
// Svelte src/routes/AdminUsers.svelte 와 의미상 1:1 정합. 사용자별 build
// rollup + 선택된 user 의 recent builds panel (BuildRow 컴포넌트로
// 통일, TASK-070 정합).

import { useEffect, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { AdminTabs } from "@/components/AdminTabs";
import { BuildRow } from "@/components/BuildRow";
import {
  listAdminBuilds,
  listAdminUsers,
  type AdminUserBuildSummary,
  type AdminUserListResponse,
  type BuildSummary
} from "@/lib/api";
import { ensureAdminAccess } from "@/lib/admin-guard";
import { useUserId } from "@/lib/useUserId";

import "./AdminUsers.css";

type AdminUserSummary = AdminUserListResponse["users"][number];

export function AdminUsers(): ReactElement {
  const [userId] = useUserId();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<
    null | { reason: "NO_USER" | "FORBIDDEN" | "NOT_IN_ALLOW_LIST" }
  >(null);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedBuilds, setSelectedBuilds] = useState<AdminUserBuildSummary[]>([]);
  const [selectedLoading, setSelectedLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      navigate("/");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const guard = await ensureAdminAccess(userId);
        if (cancelled) return;
        if (!guard.isAdmin) {
          setAccessDenied({ reason: guard.reason });
          setLoading(false);
          return;
        }
        const result = await listAdminUsers(userId);
        if (cancelled) return;
        setUsers(result.users);
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

  async function selectUser(target: string): Promise<void> {
    setSelectedUser(target);
    setSelectedLoading(true);
    try {
      if (!userId) return;
      const result = await listAdminBuilds(userId, { requestedBy: target });
      setSelectedBuilds(result.builds);
    } catch {
      setSelectedBuilds([]);
    } finally {
      setSelectedLoading(false);
    }
  }

  function closeSelected(): void {
    setSelectedUser(null);
    setSelectedBuilds([]);
  }

  if (accessDenied) {
    return (
      <AdminAccessDenied userId={userId} reason={accessDenied.reason} />
    );
  }

  return (
    <section className="admin-users-page" data-testid="admin-users">
      <AdminTabs />

      <header className="admin-users-head">
        <div>
          <h1>Users</h1>
          <p className="muted">
            {users.length} user{users.length === 1 ? "" : "s"} with build history
          </p>
        </div>
      </header>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : users.length === 0 ? (
        <p className="muted">No users.</p>
      ) : (
        <table className="admin-users-table">
          <thead>
            <tr>
              <th>User</th>
              <th className="r">Builds</th>
              <th className="r">Last build</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId} data-testid={`admin-users-row-${u.userId}`}>
                <td className="mono">@{u.userId}</td>
                <td className="r">{u.buildCount}</td>
                <td className="r">
                  {u.lastBuildAt
                    ? new Date(u.lastBuildAt).toLocaleString()
                    : "—"}
                </td>
                <td className="r">
                  {selectedUser === u.userId ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={closeSelected}
                      data-testid={`admin-users-close-${u.userId}`}
                    >
                      Close
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        void selectUser(u.userId);
                      }}
                      data-testid={`admin-users-expand-${u.userId}`}
                    >
                      Show builds
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedUser ? (
        <section className="admin-users-selected" data-testid="admin-users-selected">
          <header>
            <h2>Recent builds for @{selectedUser}</h2>
            <button
              type="button"
              className="btn-secondary"
              onClick={closeSelected}
              data-testid="admin-users-close-panel"
            >
              Close
            </button>
          </header>
          {selectedLoading ? (
            <p className="muted">Loading…</p>
          ) : selectedBuilds.length === 0 ? (
            <p className="muted">No builds.</p>
          ) : (
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Build</th>
                  <th>App</th>
                  <th className="r">Updated</th>
                </tr>
              </thead>
              <tbody>
                {selectedBuilds.map((b) => (
                  <BuildRow
                    key={b.buildId}
                    build={b as BuildSummary & { requestedBy?: string }}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}
    </section>
  );
}
