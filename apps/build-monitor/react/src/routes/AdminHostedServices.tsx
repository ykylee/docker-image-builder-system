// TASK-168 (P3-M3): AdminHostedServices — /admin/services.
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
  getHostingCapacity,
  startHostedService,
  stopHostedService,
  removeHostedService,
  getHostedServiceManifest,
  updateHostedServiceManifest,
  getHostedServiceDatabaseStatus,
  type ServiceManifestView,
  type HostedServiceView,
  type HostingCapacityView,
  type ServiceDatabaseStatusView
} from "@/lib/api";
import { ensureAdminAccess } from "@/lib/admin-guard";
import { useUserId } from "@/lib/useUserId";

import "./AdminHostedServices.css";

export function AdminHostedServices(): ReactElement {
  const [userId] = useUserId();
  const navigate = useNavigate();
  const [services, setServices] = useState<HostedServiceView[]>([]);
  const [databaseStatuses, setDatabaseStatuses] = useState<Record<string, ServiceDatabaseStatusView>>({});
  const [capacity, setCapacity] = useState<HostingCapacityView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyApp, setBusyApp] = useState<string | null>(null);
  const [manifestApp, setManifestApp] = useState<string | null>(null);
  const [manifestText, setManifestText] = useState("");
  const [manifestRevision, setManifestRevision] = useState<number | null>(null);
  const [accessDenied, setAccessDenied] = useState<
    null | { reason: "NO_USER" | "FORBIDDEN" | "NOT_IN_ALLOW_LIST" }
  >(null);

  async function refresh(): Promise<void> {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [servicesResult, capacityResult] = await Promise.all([
        listHostedServices(userId),
        getHostingCapacity(userId)
      ]);
      setServices(servicesResult.services);
      setCapacity(capacityResult);
      const databaseEntries = await Promise.all(
        servicesResult.services.map(async (service) => {
          try {
            return [service.appName, await getHostedServiceDatabaseStatus(userId, service.appName)] as const;
          } catch {
            // 404 means the service has not opted into/provisioned a database;
            // it should not hide the rest of the hosting inventory.
            return null;
          }
        })
      );
      setDatabaseStatuses(Object.fromEntries(databaseEntries.filter((entry): entry is readonly [string, ServiceDatabaseStatusView] => entry !== null)));
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

  async function openManifest(appName: string): Promise<void> {
    if (!userId) return;
    setError(null);
    try {
      const result = await getHostedServiceManifest(userId, appName);
      setManifestApp(appName);
      setManifestRevision(result.currentRevision);
      setManifestText(JSON.stringify(result.manifest, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveManifest(): Promise<void> {
    if (!userId || !manifestApp) return;
    setBusyApp(manifestApp);
    setError(null);
    try {
      const parsed = JSON.parse(manifestText) as ServiceManifestView;
      const result = await updateHostedServiceManifest(userId, manifestApp, parsed);
      setManifestRevision(result.currentRevision);
      setManifestText(JSON.stringify(result.manifest, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyApp(null);
    }
  }

  if (accessDenied) {
    return <AdminAccessDenied userId={userId} reason={accessDenied.reason} />;
  }

  const totalCpu = capacity?.capacity?.cpuMillicores ?? 2000;
  const totalMem = capacity?.capacity?.memoryMi ?? 5632;
  const cpuPercent = capacity && totalCpu > 0 ? Math.min(100, Math.max(0, (capacity.used.cpuMillicores / totalCpu) * 100)) : 0;
  const memPercent = capacity && totalMem > 0 ? Math.min(100, Math.max(0, (capacity.used.memoryMi / totalMem) * 100)) : 0;

  return (
    <section className="hosting-page" data-testid="admin-hosted-services">
      <AdminTabs />
      <div className="hosting-header-row">
        <h1 className="hosting-title">Registered Services</h1>
      </div>

      {capacity && (
        <section className="capacity-panel" data-testid="hosting-capacity-panel">
          <div className="capacity-header">
            <span className="capacity-header-title">Cluster Capacity Overview</span>
            <span className="muted">
              Remaining: {formatCpu(capacity.remaining.cpuMillicores)} / {capacity.remaining.memoryMi}Mi
            </span>
          </div>

          <div className="capacity-metrics-grid">
            {/* CPU Metric Card */}
            <div className="capacity-metric-card">
              <div className="metric-label">Reserved CPU Millicores</div>
              <div className="metric-value" data-testid="hosting-capacity-used">
                {formatCpu(capacity.used.cpuMillicores)} / {capacity.used.memoryMi}Mi
              </div>
              <div className="gauge-track">
                <div
                  className={`gauge-fill ${cpuPercent > 80 ? "warning" : ""}`}
                  style={{ width: `${cpuPercent}%` }}
                />
              </div>
            </div>

            {/* Memory Metric Card */}
            <div className="capacity-metric-card">
              <div className="metric-label">Reserved Memory Ratio</div>
              <div className="metric-value">
                {Math.round(memPercent)}% used
              </div>
              <div className="gauge-track">
                <div
                  className={`gauge-fill ${memPercent > 80 ? "warning" : ""}`}
                  style={{ width: `${memPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Tier Capacity Grid */}
          <div className="capacity-tiers-grid">
            {(["sandbox", "standard", "production"] as const).map((tier) => (
              <div
                key={tier}
                className={`tier-card ${tier}`}
                data-testid={`hosting-capacity-${tier}`}
              >
                <span className="tier-badge">{tier}</span>
                <span className="tier-services-count">
                  {capacity.tiers[tier].maxServices} services
                </span>
                <span className="muted">
                  Max capacity estimation
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading && <p className="muted" data-testid="hosting-loading">Loading…</p>}
      {error && (
        <p className="err" role="alert" data-testid="hosting-error">
          {error}
        </p>
      )}

      {!loading && services.length === 0 && (
        <p className="muted" data-testid="hosting-empty">No hosted services.</p>
      )}

      {services.length > 0 && (
        <table className="hosting-table" data-testid="hosting-table">
          <thead>
            <tr>
              <th>App</th>
              <th>Context path</th>
              <th>Tier</th>
              <th>Resources</th>
              <th>Database</th>
              <th>Status</th>
              <th>Replicas</th>
              <th>URL</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map((svc) => (
              <tr key={svc.appName} data-testid={`hosting-row-${svc.appName}`}>
                <td className="mono">{svc.appName}</td>
                <td>
                  <code className="mono">/{svc.contextPath}/</code>
                </td>
                <td data-testid={`hosting-tier-${svc.appName}`}>
                  <strong>{svc.effectiveTier ?? "sandbox"}</strong>
                  <small className="muted" style={{ display: "block" }}>
                    {svc.serviceSize ?? "small"}
                  </small>
                </td>
                <td className="mono" data-testid={`hosting-resources-${svc.appName}`}>
                  {svc.resources
                    ? `${svc.resources.cpuRequest} / ${svc.resources.memoryRequest} · ${svc.resources.replicas}r`
                    : "default"}
                </td>
                <td data-testid={`hosting-database-${svc.appName}`}>
                  {databaseStatuses[svc.appName] ? (
                    <div className="database-status">
                      <StatusPill status={databaseStatuses[svc.appName].status} />
                      <small className="muted mono">
                        {databaseStatuses[svc.appName].migrationRevision === null
                          ? "migration pending"
                          : `migration #${databaseStatuses[svc.appName].migrationRevision}`}
                      </small>
                    </div>
                  ) : (
                    <span className="muted">Not provisioned</span>
                  )}
                </td>
                <td>
                  <StatusPill status={svc.status} />
                  {svc.status === "RUNNING" &&
                    svc.availableReplicas === 0 && (
                      <span
                        className="degraded-badge"
                        data-testid={`hosting-degraded-${svc.appName}`}
                        title="Desired RUNNING 이나 available replica 0 — 파드 미기동(degraded)"
                      >
                        ⚠ degraded
                      </span>
                    )}
                </td>
                <td
                  className="mono"
                  data-testid={`hosting-replicas-${svc.appName}`}
                  title={
                    svc.lastSyncedAt
                      ? `last synced ${svc.lastSyncedAt}`
                      : "아직 sync 안 됨"
                  }
                >
                  {svc.availableReplicas ?? "—"}
                </td>
                <td>
                  {svc.url ? (
                    <a
                      href={svc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hosting-url-link"
                    >
                      {svc.url}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <div className="hosting-actions">
                    <button
                      type="button"
                      className="btn-action"
                      disabled={busyApp === svc.appName || svc.status === "STOPPED"}
                      data-testid={`hosting-stop-${svc.appName}`}
                      onClick={() => runAction(svc.appName, stopHostedService)}
                    >
                      Stop
                    </button>
                    <button
                      type="button"
                      className="btn-action"
                      disabled={busyApp === svc.appName || svc.status === "RUNNING"}
                      data-testid={`hosting-start-${svc.appName}`}
                      onClick={() => runAction(svc.appName, startHostedService)}
                    >
                      Start
                    </button>
                    <button
                      type="button"
                      className="btn-action danger"
                      disabled={busyApp === svc.appName}
                      data-testid={`hosting-delete-${svc.appName}`}
                      onClick={() => runAction(svc.appName, removeHostedService)}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="btn-action"
                      disabled={busyApp === svc.appName}
                      data-testid={`hosting-manifest-${svc.appName}`}
                      onClick={() => void openManifest(svc.appName)}
                    >
                      Manifest
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {manifestApp && (
        <section className="manifest-panel" data-testid="hosting-manifest-editor">
          <div className="manifest-toolbar">
            <div className="manifest-title">
              <strong>{manifestApp} service manifest</strong>
              <span className="manifest-revision-tag">rev {manifestRevision ?? "—"}</span>
            </div>
            <span className="muted">JSON Configuration</span>
          </div>
          <textarea
            value={manifestText}
            onChange={(event) => setManifestText(event.target.value)}
            rows={18}
            spellCheck={false}
            className="manifest-editor"
            data-testid="hosting-manifest-text"
          />
          <div className="hosting-actions">
            <button
              type="button"
              className="btn-action"
              onClick={() => void saveManifest()}
              disabled={busyApp === manifestApp}
            >
              Save revision
            </button>
            <button type="button" className="btn-action" onClick={() => setManifestApp(null)}>
              Close
            </button>
          </div>
        </section>
      )}
    </section>
  );
}

function formatCpu(millicores: number): string {
  return millicores >= 1000 && millicores % 1000 === 0
    ? `${millicores / 1000} CPU`
    : `${millicores}m`;
}
