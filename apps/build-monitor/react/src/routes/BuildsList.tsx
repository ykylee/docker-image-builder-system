// TASK-090: BuildsList (React).
//
// Svelte src/routes/BuildsList.svelte 와 1:1 정합 — localStorage.userId
// 확인 → /builds API 호출 → builds set → status chip filter → BuildRow.
// 인증 정보 없으면 `/` 로 redirect (Login 페이지 진입 후 다시 /builds).
//
// FilterChips Svelte 컴포넌트는 React 변환 시 같은 디자인 토큰 + 인터랙션
// 패턴을 inline button 으로 단순 구현 — 본 task 범위는 페이지 자체의
// 1:1 마이그레이션이며 chip 디자인 시스템의 React 컴포넌트화는
// TASK-092 (lib layer 마이그레이션) 이후 검토.

import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { BuildRow } from "@/components/BuildRow";
import { listBuilds, type BuildSummary } from "@/lib/api";
import { matchesChip, type StatusFilter } from "@/lib/chipFilter";
import { useUserId } from "@/lib/useUserId";
import "./BuildsList.css";

export function BuildsList(): ReactElement {
  const [userId] = useUserId();
  const navigate = useNavigate();
  const [builds, setBuilds] = useState<BuildSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("ALL");

  useEffect(() => {
    if (userId === null) {
      setLoading(false);
      navigate("/", { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await listBuilds({ requestedBy: userId });
        if (!cancelled) {
          setBuilds(result.builds);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, navigate]);

  const visible = useMemo(() => {
    if (filter === "ALL") return builds;
    return builds.filter((b) => matchesChip(b, filter));
  }, [builds, filter]);

  const filterChips: StatusFilter[] = [
    "ALL",
    "BUILDING",
    "COMPLETED",
    "FAILED"
  ];

  return (
    <section className="list-page">
      <header className="page-head">
        <h1>Builds</h1>
        <div className="chips" role="group" aria-label="Status filter">
          {filterChips.map((chip) => (
            <button
              key={chip}
              type="button"
              className={`chip${filter === chip ? " chip--active" : ""}`}
              onClick={() => {
                setFilter(chip);
              }}
              aria-pressed={filter === chip}
            >
              {chip}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : error !== null ? (
        <p className="err" role="alert">{error}</p>
      ) : visible.length === 0 ? (
        <p className="muted">No builds.</p>
      ) : (
        <table className="builds-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Build</th>
              <th>App</th>
              <th className="r">Updated</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((b) => (
              <BuildRow key={b.buildId} build={b} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}