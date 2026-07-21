// TASK-091: PhaseTimeline (React).
//
// Svelte src/components/PhaseTimeline.svelte 와 1:1 정합. canonical 9 phases
// 전체를 표시하고 각 phase 는 "완료 / 현재 진행 / 미진행" 셋 중 하나의
// 상태로 시각화:
//   - 완료: completed dot + completedAt 타임스탬프
//   - 현재: dot + "in-progress" 라벨 + startedAt
//   - 미진행: dot 만 흐리게
//
// FAILED phase 가 completedMap 에 push 되면 자동 danger 톤 (Svelte 와 동일
// data-phase="FAILED" selector 로 별도 처리 — 디자인 토큰 자동 follow).
//
// a11y: <ol role="list"> + 각 step role="listitem" + 상태별 aria-label.
//
// 디자인 토큰: --dib-color-accent-success / --dib-color-accent-primary /
// --dib-color-accent-danger / --dib-color-text-muted / --dib-color-bg-canvas /
// --dib-color-border-subtle — globals.css cascade 와 정합.

import type { CSSProperties, ReactElement } from "react";

// canonical 9 phases. shared-contract 와 동일한 순서/철자.
const CANONICAL_PHASES = [
  "REQUEST_ACCEPTED",
  "QUEUE_CLAIMED",
  "SOURCE_PREPARED",
  "DOCKER_BUILD_STARTED",
  "DOCKER_BUILD_COMPLETED",
  "PREVIEW_QUEUED",
  "PREVIEW_READY",
  "COMPLETED",
  "FAILED"
] as const;

type BuildPhase = (typeof CANONICAL_PHASES)[number];

// prop type 은 넓게 string 으로 받는다. api.ts 의 BuildStatusResponse 가
// generated type 으로 좁혀져 있어도, 미래의 새 phase 가 추가돼도 component
// 내부에서 CANONICAL_PHASES 와 비교해 매칭 여부 결정.
type PhaseHistoryEntry = {
  phase: string;
  completedAt: string;
};
type CurrentPhaseEntry = {
  phase: string;
  startedAt: string;
};

type Status = "completed" | "current" | "pending";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

export function PhaseTimeline({
  phaseHistory,
  currentPhase
}: {
  phaseHistory: PhaseHistoryEntry[];
  currentPhase: CurrentPhaseEntry | null;
}): ReactElement {
  // phaseHistory 를 Map<phase, completedAt> 으로 정규화. canonical 9 phases
  // 중 어떤 게 완료됐는지 빠르게 조회.
  const completedMap = new Map(
    phaseHistory.map((entry) => [entry.phase, entry.completedAt])
  );

  function statusFor(phase: BuildPhase): Status {
    if (completedMap.has(phase)) {
      return "completed";
    }
    if (currentPhase && currentPhase.phase === phase) {
      return "current";
    }
    return "pending";
  }

  function completedAtFor(phase: BuildPhase): string | null {
    return completedMap.get(phase) ?? null;
  }

  // timeline / step / dot / body 스타일 — Svelte scoped CSS 와 의미상
  // 동일한 디자인 토큰 매핑. React 는 inline style 로 CSS variable 직접
  // 주입 (BuildRow.tsx / StatusPill.tsx 와 동일 패턴).
  const timelineStyle: CSSProperties = {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: "var(--dib-space-md)",
    position: "relative"
  };

  return (
    <ol
      role="list"
      aria-label="Build phase timeline"
      data-testid="phase-timeline"
      style={timelineStyle}
    >
      {CANONICAL_PHASES.map((phase) => {
        const status = statusFor(phase);
        const completedAt = completedAtFor(phase);
        return (
          <PhaseStep
            key={phase}
            phase={phase}
            status={status}
            completedAt={completedAt}
            currentPhase={currentPhase}
            formatTimestamp={formatTimestamp}
          />
        );
      })}
    </ol>
  );
}

function PhaseStep({
  phase,
  status,
  completedAt,
  currentPhase,
  formatTimestamp
}: {
  phase: BuildPhase;
  status: Status;
  completedAt: string | null;
  currentPhase: CurrentPhaseEntry | null;
  formatTimestamp: (iso: string) => string;
}): ReactElement {
  const stepStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "12px 1fr",
    alignItems: "start",
    gap: "var(--dib-space-lg)",
    position: "relative",
    zIndex: 1
  };

  const dotBase: CSSProperties = {
    width: "11px",
    height: "11px",
    borderRadius: "var(--dib-radius-pill)",
    background: "var(--dib-color-bg-canvas)",
    boxShadow: "0 0 0 2px var(--dib-color-border-subtle)",
    marginTop: "6px",
    border: "2px solid var(--dib-color-bg-surface)"
  };

  const dotCompleted: CSSProperties = {
    ...dotBase,
    background:
      phase === "FAILED"
        ? "var(--dib-color-accent-danger)"
        : "var(--dib-color-accent-success)",
    boxShadow:
      phase === "FAILED"
        ? "0 0 8px color-mix(in srgb, var(--dib-color-accent-danger) 35%, transparent)"
        : "0 0 8px color-mix(in srgb, var(--dib-color-accent-success) 35%, transparent)"
  };

  const dotCurrent: CSSProperties = {
    ...dotBase,
    background: "var(--dib-color-accent-primary)",
    boxShadow:
      "0 0 12px color-mix(in srgb, var(--dib-color-accent-primary) 45%, transparent)",
    animation: "phase-pulse 1.6s ease-in-out infinite"
  };

  const bodyStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "2px"
  };

  const phaseLabelStyle: CSSProperties = {
    fontSize: "var(--dib-size-sm)",
    fontWeight: "var(--dib-weight-semibold)",
    color:
      status === "pending"
        ? "var(--dib-color-text-muted)"
        : "var(--dib-color-text-primary)",
    fontFamily: "var(--dib-font-mono)"
  };

  const metaStyle: CSSProperties = {
    fontSize: "var(--dib-size-xs)"
  };

  let tsStyle: CSSProperties = {
    color: "var(--dib-color-text-secondary)",
    fontFamily: "var(--dib-font-mono)"
  };
  if (status === "pending") {
    tsStyle = { ...tsStyle, color: "var(--dib-color-text-muted)" };
  } else if (status === "current") {
    tsStyle = {
      ...tsStyle,
      color: "var(--dib-color-accent-primary)",
      fontWeight: "var(--dib-weight-medium)"
    };
  } else if (status === "completed") {
    if (phase === "FAILED") {
      tsStyle = { ...tsStyle, color: "var(--dib-color-accent-danger)" };
    } else {
      tsStyle = { ...tsStyle, color: "var(--dib-color-accent-success)" };
    }
  }

  return (
    <li
      role="listitem"
      data-phase={phase}
      data-status={status}
      aria-label={`${phase} — ${status}`}
      style={stepStyle}
    >
      <span
        aria-hidden="true"
        style={
          status === "completed"
            ? dotCompleted
            : status === "current"
              ? dotCurrent
              : dotBase
        }
      />
      <div style={bodyStyle}>
        <div style={phaseLabelStyle}>{phase}</div>
        <div style={metaStyle}>
          {status === "completed" && completedAt ? (
            <span style={tsStyle} title="Completed at">
              ✓ {formatTimestamp(completedAt)}
            </span>
          ) : status === "current" && currentPhase ? (
            <span style={tsStyle} title="Updated at">
              ● in-progress · {formatTimestamp(currentPhase.startedAt)}
            </span>
          ) : (
            <span style={tsStyle}>— pending</span>
          )}
        </div>
      </div>
    </li>
  );
}
