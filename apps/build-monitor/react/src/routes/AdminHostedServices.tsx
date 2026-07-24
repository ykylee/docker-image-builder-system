// TASK-168 (P3-M3): AdminHostedServices — /admin/hosting.
//
// 호스팅 서비스 목록 + 수명 관리(stop/start/delete). build-server 가 kubectl
// 로 실제 조작하고, 이 페이지는 그 관리 API 를 호출한다. AdminRunners 와 동일
// 한 admin 가드/로드/액션 패턴.

import { useEffect, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { AdminTabs } from "@/components/AdminTabs";
import { StatusPill } from "@/components/StatusPill";
import {
  listHostedServices,
  startHostedService,
  stopHostedService,
  removeHostedService,
  type HostedServiceView
} from "@/lib/api";
import { ensureAdminAccess } from "@/lib/admin-guard";
import { useUserId } from "@/lib/useUserId";

export function AdminHostedServices(): ReactElement {
  const [userId] = useUserId();
  const navigate = useNavigate();
  const [services, setServices] = useState<HostedServiceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyApp, setBusyApp] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<
    null | { reason: "NO_USER" | "FORBIDDEN" | "NOT_IN_ALLOW_LIST" }
  >(null);

  async function refresh(): Promise<void> {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listHostedServices(userId);
      setServices(result.services);
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
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function runAction(
    appName: string,
    action: (callerId: string, appName: string) => Promise<HostedServiceView>
  ): Promise<void> {
    if (!userId) return;
    setBusyApp(appName);
    setError(null);
    try {
      await action(userId, appName);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyApp(null);
    }
  }

  if (accessDenied) {
    return <AdminAccessDenied userId={userId} reason={accessDenied.reason} />;
  }

  return (
    <section data-testid="admin-hosted-services">
      <AdminTabs />
      <h1>Hosted Services</h1>

      {loading && <p data-testid="hosting-loading">Loading…</p>}
      {error && (
        <p role="alert" data-testid="hosting-error">
          {error}
        </p>
      )}

      {!loading && services.length === 0 && (
        <p data-testid="hosting-empty">No hosted services.</p>
      )}

      {services.length > 0 && (
        <table data-testid="hosting-table">
          <thead>
            <tr>
              <th>App</th>
              <th>Context path</th>
              <th>Status</th>
              <th>URL</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map((svc) => (
              <tr key={svc.appName} data-testid={`hosting-row-${svc.appName}`}>
                <td>{svc.appName}</td>
                <td>
                  <code>/{svc.contextPath}/</code>
                </td>
                <td>
                  <StatusPill status={svc.status} />
                </td>
                <td>
                  {svc.url ? (
                    <a href={svc.url} target="_blank" rel="noreferrer">
                      {svc.url}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    disabled={busyApp === svc.appName || svc.status === "STOPPED"}
                    data-testid={`hosting-stop-${svc.appName}`}
                    onClick={() => runAction(svc.appName, stopHostedService)}
                  >
                    Stop
                  </button>
                  <button
                    type="button"
                    disabled={busyApp === svc.appName || svc.status === "RUNNING"}
                    data-testid={`hosting-start-${svc.appName}`}
                    onClick={() => runAction(svc.appName, startHostedService)}
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    disabled={busyApp === svc.appName}
                    data-testid={`hosting-delete-${svc.appName}`}
                    onClick={() => runAction(svc.appName, removeHostedService)}
                  >
                    Delete
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
