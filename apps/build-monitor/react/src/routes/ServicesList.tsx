import { useEffect, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { StatusPill } from "@/components/StatusPill";
import { listUserHostedServices, type HostedServiceView } from "@/lib/api";
import { useUserId } from "@/lib/useUserId";

import "./ServicesList.css";

export function ServicesList(): ReactElement {
  const [userId] = useUserId();
  const navigate = useNavigate();
  const [services, setServices] = useState<HostedServiceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      navigate("/", { replace: true });
      return;
    }
    let cancelled = false;
    setLoading(true);
    listUserHostedServices(userId)
      .then((result) => {
        if (!cancelled) setServices(result.services);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, navigate]);

  return (
    <section className="services-page" data-testid="services-list">
      <header className="page-head">
        <div>
          <p className="eyebrow">LIVE APPS</p>
          <h1>Services</h1>
          <p className="muted">현재 운영 중이거나 중지된 내 앱을 확인합니다.</p>
        </div>
        <button className="services-refresh" type="button" onClick={() => window.location.reload()}>
          Refresh
        </button>
      </header>

      {loading ? <p className="muted">Loading…</p> : null}
      {error ? <p className="err" role="alert">{error}</p> : null}
      {!loading && !error && services.length === 0 ? (
        <div className="services-empty">
          <h2>아직 운영 중인 앱이 없습니다.</h2>
          <p className="muted">New Build에서 앱을 업로드하고 배포하면 이곳에 표시됩니다.</p>
        </div>
      ) : null}
      <div className="services-grid">
        {services.map((service) => (
          <article className="service-card" key={service.appName} data-testid={`service-${service.appName}`}>
            <div className="service-card-head">
              <div>
                <h2>{service.appName}</h2>
                <p className="mono">/{service.contextPath}/</p>
              </div>
              <StatusPill status={service.status} />
            </div>
            <dl className="service-meta">
              <div><dt>URL</dt><dd>{service.url ? <a href={service.url} target="_blank" rel="noreferrer">{service.url}</a> : "Not available"}</dd></div>
              <div><dt>Build</dt><dd className="mono">{service.currentBuildId ?? "—"}</dd></div>
              <div><dt>Last deployed</dt><dd>{service.lastDeployedAt ? new Date(service.lastDeployedAt).toLocaleString() : "—"}</dd></div>
              <div><dt>Replicas</dt><dd>{service.availableReplicas ?? "—"} / {service.resources?.replicas ?? "—"}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
