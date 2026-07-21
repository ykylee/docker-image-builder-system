// TASK-141: 빌드 목록 테이블의 열 정의 (Astryx `Table` 용).
//
// BuildsList 가 먼저 Astryx Table 로 옮겨졌고, AdminBuilds / AdminUsers 는
// 아직 기존 `<table>` + `BuildRow` 를 쓴다. 그 둘을 옮길 때 **이 파일을 그대로
// 재사용**하면 되도록 열 정의를 컴포넌트 밖으로 뺐다.
//
// 그때까지는 셀 렌더링이 `BuildRow.tsx` 와 이 파일에 **중복**된다. 의도된
// 과도기이며, admin 이관이 끝나면 `BuildRow.tsx` 를 지운다.

import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { Text } from "@astryxdesign/core";
import { proportional, pixel, type TableColumn } from "@astryxdesign/core/Table";

import { StatusPill } from "@/components/StatusPill";
import type { BuildSummary } from "@/lib/api";

export type BuildRowData = BuildSummary & { requestedBy?: string };

/** 상대 시각 — 운영자가 "얼마나 오래됐나" 를 즉시 읽도록. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function BuildIdCell({ build }: { build: BuildRowData }): ReactElement {
  // 빌드 상세로 가는 **탐색**이므로 Link 를 유지한다 — 새 탭 열기·주소 복사가
  // 가능해야 하고 스크린리더도 링크로 읽어야 한다.
  return (
    <Link to={`/builds/${build.buildId}`} className="mono build-id-link">
      {build.buildId.slice(0, 8)}
    </Link>
  );
}

/**
 * 열 정의.
 *
 * `withOwner` 는 admin 화면용 — `BuildSummary` 자체에는 `requestedBy` 가 없고
 * AdminBuilds / AdminUsers 가 super-set 으로 넘긴다.
 */
export function buildColumns(
  withOwner = false
): TableColumn<BuildRowData>[] {
  const columns: TableColumn<BuildRowData>[] = [
    {
      key: "status",
      header: "Status",
      width: pixel(180),
      renderCell: (b) => (
        <StatusPill status={b.status} lifecycleStatus={b.lifecycleStatus} />
      )
    },
    {
      key: "buildId",
      header: "Build",
      width: pixel(120),
      renderCell: (b) => <BuildIdCell build={b} />
    },
    {
      key: "appName",
      header: "App",
      width: proportional(1),
      renderCell: (b) => (
        // 긴 appName 은 잘라서 한 줄 유지 — 전체 이름은 title 로 확인한다
        // (Table 의 textOverflow="truncate" 와 함께 동작).
        <span className="mono" title={b.appName}>
          {b.appName}
        </span>
      )
    }
  ];

  if (withOwner) {
    columns.push({
      key: "requestedBy",
      header: "Owner",
      width: pixel(160),
      renderCell: (b) =>
        b.requestedBy === undefined ? null : (
          <span className="mono owner-pill">@{b.requestedBy}</span>
        )
    });
  }

  columns.push({
    key: "updatedAt",
    header: "Updated",
    width: pixel(120),
    align: "end",
    renderCell: (b) => (
      <Text type="supporting" color="secondary">
        <span title={b.updatedAt}>{relativeTime(b.updatedAt)}</span>
      </Text>
    )
  });

  return columns;
}
