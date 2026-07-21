// TASK-098: AdminBuilds (React) — /admin/builds React 마이그레이션.
//
// Svelte src/routes/AdminBuilds.svelte 와 의미상 1:1 정합. TASK-043/084 의
// admin 진입점 + 권한 가드 패턴. 본 TASK 에서 React 측으로 신규 추가 —
// Svelte 측 admin pages 가 그대로 유지되는 동안 (cross-framework 공존)
// 사용되지 않지만, TASK-100 (Group F) 에서 App.tsx 의 admin routes 가
// Svelte 측 pages 에서 React 측 pages 로 교체될 때 본 컴포넌트가 활성화.

import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { AdminTabs } from "@/components/AdminTabs";
import { Table } from "@astryxdesign/core";
import { FilterChips } from "@/components/FilterChips";
import { buildColumns } from "@/components/buildColumns";
import {
  listAdminBuilds,
  type AdminUserBuildSummary,
  type BuildSummary
} from "@/lib/api";
import { matchesChip, type StatusFilter } from "@/lib/chipFilter";
import { ensureAdminAccess } from "@/lib/admin-guard";
import { useUserId } from "@/lib/useUserId";

import "./AdminBuilds.css";

export function AdminBuilds(): ReactElement {
  const [userId] = useUserId();
  const navigate = useNavigate();
  const [builds, setBuilds] = useState<AdminUserBuildSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<
    null | { reason: "NO_USER" | "FORBIDDEN" | "NOT_IN_ALLOW_LIST" }
  >(null);
  const [ownerFilter, setOwnerFilter] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("ALL");

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
        const result = await listAdminBuilds(userId);
        if (cancelled) return;
        setBuilds(result.builds);
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
    // navigate reference 안정적. userId 만 의존.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function applyFilter(): Promise<void> {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listAdminBuilds(userId, {
        requestedBy: ownerFilter.trim() || undefined
      });
      setBuilds(result.builds);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function clearFilter(): Promise<void> {
    setOwnerFilter("");
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listAdminBuilds(userId);
      setBuilds(result.builds);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const visible = useMemo(
    () => (filter === "ALL" ? builds : builds.filter((b) => matchesChip(b, filter))),
    [builds, filter]
  );

  if (accessDenied) {
    return (
      <AdminAccessDenied userId={userId} reason={accessDenied.reason} />
    );
  }

  return (
    <section className="admin-builds-page" data-testid="admin-builds">
      <AdminTabs />

      <header className="admin-builds-head">
        <div>
          <h1>All Builds</h1>
          <p className="muted">
            {builds.length} build{builds.length === 1 ? "" : "s"}
            {ownerFilter ? ` for @${ownerFilter}` : " across all owners"}
          </p>
        </div>
        <FilterChips
          options={["ALL", "BUILDING", "COMPLETED", "FAILED"]}
          selected={filter}
          onSelect={(v) => {
            setFilter(v);
          }}
          ariaLabel="Status filter"
        />
      </header>

      <form
        className="admin-builds-owner-filter"
        onSubmit={(e) => {
          e.preventDefault();
          void applyFilter();
        }}
      >
        <label htmlFor="admin-builds-owner">Owner</label>
        <input
          id="admin-builds-owner"
          type="text"
          value={ownerFilter}
          onChange={(e) => {
            setOwnerFilter(e.target.value);
          }}
          placeholder="user id (e.g. alice)"
          data-testid="admin-builds-owner-input"
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={loading}
          data-testid="admin-builds-apply"
        >
          Apply
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            void clearFilter();
          }}
          disabled={loading}
          data-testid="admin-builds-clear"
        >
          Clear
        </button>
      </form>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : visible.length === 0 ? (
        <p className="muted">No builds.</p>
      ) : (
        // TASK-142: 손수 만든 <table> + BuildRow → Astryx Table.
        //
        // 이관 전 헤더는 6열(Status/Build/Project/Repository/Owner/Updated)을
        // 선언했지만 BuildSummary 에는 project/repository 필드가 **없다** — 본문
        // BuildRow 는 App(appName) 한 열이었다. 즉 Project/Repository 는
        // 존재하지 않는 데이터를 가리키는 **유령 헤더**였고 헤더-본문 열이
        // 어긋나 있었다 (admin 테스트가 삭제된 상태라 미검출, TASK-137 참조).
        // buildColumns 로 통일하면서 해소된다.
        <Table
          data={visible as (BuildSummary & { requestedBy?: string })[]}
          columns={buildColumns(true)}
          idKey="buildId"
          density="balanced"
          hasHover
          textOverflow="truncate"
        />
      )}
      {/* Link import 는 현재 사용되지 않지만, 향후 deep link 통합 가능성으로 보존. */}
      <Link to="/admin/users" style={{ display: "none" }} aria-hidden="true">
        Users
      </Link>
    </section>
  );
}
