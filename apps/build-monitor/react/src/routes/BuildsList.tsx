// TASK-090/092: BuildsList (React).
//
// Svelte src/routes/BuildsList.svelte 와 1:1 정합 — localStorage.userId
// 확인 → /builds API 호출 → builds set → status chip filter → BuildRow.
// 인증 정보 없으면 `/` 로 redirect (Login 페이지 진입 후 다시 /builds).
//
// TASK-092: useState 4개 + useEffect lifecycle 을 Zustand store
// (useBuildsListStore) 로 통합. useEffect 는 userId 변화 + AbortController
// lifecycle 만 관리. fetch action + selector 가 store 에 격리되어 store
// 단위 테스트가 가능.
//
// FilterChips Svelte 컴포넌트는 React 변환 시 같은 디자인 토큰 + 인터랙션
// 패턴을 inline button 으로 단순 구현 — 본 task 범위는 페이지 자체의
// 1:1 마이그레이션이며 chip 디자인 시스템의 React 컴포넌트화는
// TASK-092 (lib layer 마이그레이션) 이후 검토.

import { useEffect, useMemo, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { Table } from "@astryxdesign/core";

import { buildColumns } from "@/components/buildColumns";
import { matchesChip, type StatusFilter } from "@/lib/chipFilter";
import { useBuildsListStore } from "@/lib/stores/buildsListStore";
import { useUserId } from "@/lib/useUserId";
import "./BuildsList.css";

export function BuildsList(): ReactElement {
  const [userId] = useUserId();
  const navigate = useNavigate();
  // 개별 selector 로 구독 — store 전체 re-render 회피.
  const builds = useBuildsListStore((s) => s.builds);
  const loading = useBuildsListStore((s) => s.loading);
  const error = useBuildsListStore((s) => s.error);
  const filter = useBuildsListStore((s) => s.filter);
  const fetchBuilds = useBuildsListStore((s) => s.fetchBuilds);
  const setFilter = useBuildsListStore((s) => s.setFilter);
  const reset = useBuildsListStore((s) => s.reset);

  useEffect(() => {
    if (userId === null) {
      reset();
      navigate("/", { replace: true });
      return;
    }

    const controller = new AbortController();
    fetchBuilds({ userId, signal: controller.signal });

    return () => {
      controller.abort();
    };

    // navigate / reset / fetchBuilds 는 store/action reference 로 안정적.
    // userId 가 바뀔 때만 fetch 재시작.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // TASK-141: 손수 만든 <table> + BuildRow → Astryx Table.
        // 정렬·밀도·잘림 처리·헤더 시맨틱이 컴포넌트 쪽으로 넘어갔다.
        <Table
          data={visible}
          columns={buildColumns()}
          idKey="buildId"
          density="balanced"
          hasHover
          textOverflow="truncate"
        />
      )}
    </section>
  );
}
