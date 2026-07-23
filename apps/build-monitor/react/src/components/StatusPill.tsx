// TASK-141: StatusPill — Astryx `Badge` 이관 + **배지 정책 변경**.
//
// ── 무엇이 바뀌었나 ───────────────────────────────────────────────────
// 이전에는 **모든 상태**를 색이 있는 알약으로 그렸다. Astryx Badge 문서는 그
// 패턴을 명시적으로 권하지 않는다:
//
//   "Don't: Apply a success badge to every healthy/active/normal item.
//    If all rows show green Active badges, none stand out."
//   "Don't: Repeat the same badge in every row of a table or list."
//
// 빌드 목록은 대부분의 행이 COMPLETED 로 끝난다 — 전부 초록 배지를 달면
// 화면이 초록으로 덮이고 **정작 봐야 할 FAILED 가 묻힌다.**
//
// 그래서 **주의가 필요한 상태만 배지**로 두고, 정상 종료·대기 상태는 평문으로
// 낮췄다 (사용자 결정). 실패와 진행 중이 한눈에 들어온다.
//
// ── 유지한 계약 ───────────────────────────────────────────────────────
// - `role="status"` + `aria-label="Status: <STATUS>"` — 두 경로 모두. 평문으로
//   낮췄다고 스크린리더에서 상태가 사라지면 안 된다.
// - `lifecycleStatus` 가 있으면 그것을 우선 (없으면 legacy `status`).
// - 빈 값 → `UNKNOWN`.

import type { ReactElement } from "react";
import { Badge, Text } from "@astryxdesign/core";

type BadgeVariant = "info" | "success" | "warning" | "error";

/**
 * **주의가 필요한** 상태만 배지로 올린다.
 *
 * 여기 없는 상태(RECEIVED / QUEUED / CANCELLED / EXPIRED / *_SUCCESS /
 * COMPLETED / ACTIVE)는 평문이다 — 정상이거나 기다리는 중이라 사용자의 행동을
 * 요구하지 않는다.
 *
 * `success` variant 를 **아무 상태에도 쓰지 않는 것**이 이 정책의 핵심이다.
 * 성공은 기대되는 결과이므로 강조할 이유가 없다.
 */
const ATTENTION_VARIANT: Readonly<Record<string, BadgeVariant>> = {
  // 진행 중 — 아직 끝나지 않았음을 알린다
  PREPARING_SOURCE: "warning",
  BUILDING: "warning",
  TESTING: "info",
  DEPLOYING: "info",
  // TASK-159 (P2-M1 Step 2): legacy status 제거.
  //   CLAIMED    → PREPARING_SOURCE 로 병합 (위의 warning 이 그 자리를 대신한다)
  //   TEST_READY → TEST_SUCCESS 가 됐고, 본 정책상 `*_SUCCESS` 는 **평문**이다
  //                ("성공은 기대되는 결과이므로 강조할 이유가 없다") — 배지에서 뺀다.
  PROVISIONING: "info",
  CONTAINER_TEST_STARTED: "info",
  CONTAINER_TEST_PASSED: "info",
  // 실패 — 사용자의 행동이 필요하다
  FAILED: "error",
  DISABLED: "error"
};

/** 이 상태가 배지로 강조되는지. 테스트와 호출부가 정책을 확인할 때 쓴다. */
export function attentionVariantFor(status: string): BadgeVariant | null {
  return ATTENTION_VARIANT[status] ?? null;
}

export function StatusPill({
  status,
  lifecycleStatus
}: {
  status: string;
  lifecycleStatus?: string;
}): ReactElement {
  const effective = lifecycleStatus ?? status;
  const label = effective || "UNKNOWN";
  const variant = attentionVariantFor(label);

  // 평문 경로 — 정상/대기 상태. 배지가 아니어도 상태는 읽혀야 하므로
  // role 과 aria-label 은 동일하게 유지한다.
  if (variant === null) {
    return (
      <Text
        role="status"
        aria-label={`Status: ${label}`}
        type="supporting"
        color="secondary"
      >
        {label}
      </Text>
    );
  }

  return (
    <Badge
      role="status"
      aria-label={`Status: ${label}`}
      variant={variant}
      label={label}
    />
  );
}
