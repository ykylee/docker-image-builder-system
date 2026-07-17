// TASK-098: AdminAdmins (React) — /admin/admins React 마이그레이션.
//
// Svelte src/routes/AdminAdmins.svelte 와 의미상 1:1 정합. admin allow-list
// 관리 페이지 — TASK-049 의 list/add/remove 와 TASK-076 의 별도 adminId
// store 폐기 + userId 가 곧 admin id 인 semantics.

import { useEffect, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { AdminTabs } from "@/components/AdminTabs";
import { ensureAdminAccess } from "@/lib/admin-guard";
import { useAdminAllowListStore } from "@/lib/stores/adminAllowListStore";
import { useUserId } from "@/lib/useUserId";

import "./AdminAdmins.css";

const ADMIN_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function AdminAdmins(): ReactElement {
  const [userId] = useUserId();
  const navigate = useNavigate();
  const admins = useAdminAllowListStore((s) => s.admins);
  const refresh = useAdminAllowListStore((s) => s.refresh);
  const addAdmin = useAdminAllowListStore((s) => s.add);
  const removeAdmin = useAdminAllowListStore((s) => s.remove);
  const [accessDenied, setAccessDenied] = useState<
    null | { reason: "NO_USER" | "FORBIDDEN" | "NOT_IN_ALLOW_LIST" }
  >(null);
  const [newAdminId, setNewAdminId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) {
      navigate("/");
      return;
    }
    let cancelled = false;
    (async () => {
      const guard = await ensureAdminAccess(userId);
      if (cancelled) return;
      if (!guard.isAdmin) {
        setAccessDenied({ reason: guard.reason });
        return;
      }
      try {
        setBusy(true);
        await refresh(userId);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function add(): Promise<void> {
    if (!userId) return;
    const trimmed = newAdminId.trim();
    if (!trimmed) {
      setError("Admin id 는 비어 있을 수 없습니다.");
      return;
    }
    if (!ADMIN_ID_PATTERN.test(trimmed)) {
      setError(
        `Admin id 는 letters / digits / dot / underscore / hyphen 만 가능합니다: ${trimmed}`
      );
      return;
    }
    if (admins.includes(trimmed)) {
      setError(`이미 allow-list 에 있습니다: ${trimmed}`);
      return;
    }
    try {
      setBusy(true);
      setError(null);
      await addAdmin(userId, trimmed);
      setNewAdminId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: string): Promise<void> {
    if (!userId) return;
    try {
      setBusy(true);
      setError(null);
      await removeAdmin(userId, target);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (accessDenied) {
    return (
      <AdminAccessDenied userId={userId} reason={accessDenied.reason} />
    );
  }

  return (
    <section className="admin-admins-page" data-testid="admin-admins">
      <AdminTabs />

      <header className="admin-admins-head">
        <div>
          <h1>Admin allow-list</h1>
          <p className="muted">
            {admins.length} admin{admins.length === 1 ? "" : "s"} registered
          </p>
        </div>
      </header>

      <form
        className="admin-admins-add"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label htmlFor="admin-admins-new-id">New admin id</label>
        <input
          id="admin-admins-new-id"
          type="text"
          value={newAdminId}
          onChange={(e) => {
            setNewAdminId(e.target.value);
          }}
          placeholder="user id (e.g. alice)"
          data-testid="admin-admins-new-id-input"
          pattern="[a-zA-Z0-9._\-]+"
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={busy}
          data-testid="admin-admins-add-submit"
        >
          Add
        </button>
      </form>

      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}

      {admins.length === 0 ? (
        <p className="muted">No admins.</p>
      ) : (
        <table className="admin-admins-table">
          <thead>
            <tr>
              <th>Admin id</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a} data-testid={`admin-admins-row-${a}`}>
                <td className="mono">@{a}</td>
                <td className="r">
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => {
                      void remove(a);
                    }}
                    disabled={busy}
                    data-testid={`admin-admins-remove-${a}`}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
