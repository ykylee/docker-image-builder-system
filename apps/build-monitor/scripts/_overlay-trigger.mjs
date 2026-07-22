// TASK-148 — B층 가드 공용: 오버레이(모달) 자동 오픈 + 스코프.
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 이 helper 가 필요한가
// ─────────────────────────────────────────────────────────────────────────
// TASK-133 / TASK-146 의 B층 가드 두 종류는 모두 실브라우저에서 "현재 보이는
// 페이지"를 감사한다. 그러나 **모달은 사용자 상호작용으로만 열린다** — 페이지
// 초기 진입 상태에서는 모달 안의 텍스트·버튼·레이블이 DOM 에 없다. 그래서
// 가드 두 종류 모두 모달 내부 텍스트는 감사 대상에서 빠져 있었다.
//
// TASK-137 회고에서 "B층 가드가 모달을 열지 않아 오버레이는 검사 범위 밖
// (sr-only 'Close' 는 rect 0×0 이라 isVisible 이 정확히 건너뜀 — 오탐 우려는
// 없음 확인)" 라고 적혀 있다. 그 사각지대를 메우기 위해 가드가 라우트별로
// 모달을 자동으로 여는 단일 통로를 이 helper 로 둔다.
//
// ─────────────────────────────────────────────────────────────────────────
// 트리거 규약 (generic, 향후 모달 추가 시 코드 변경 최소화)
// ─────────────────────────────────────────────────────────────────────────
// - 마크업 측: 모달을 여는 버튼에 `data-open-modal="<name>"` 어트리뷰트 부여.
//   이 셀렉터는 가드만 쓰고 사람/AT 대상이 아니므로 시각·a11y 영향 0.
// - 가드 측: MODAL_TRIGGERS 배열에 `{ route, name, scopeSelector }` 한 줄
//   추가. 새 모달은 마크업에 `data-open-modal` + 가드에 한 줄, 끝.
//
// scopeSelector 는 감사 범위를 **모달 안**으로 좁힌다. 모달을 열면 화면
// 전체에 어두운 backdrop 이 깔리지만 그 위의 모달 컨테이너 안 요소들만
// 검사한다. 모달 바깥 페이지 요소는 이미 1차(열기 전)에서 검사됐으므로
// 2차(연 후)에서는 중복되지 않는다.
//
// ─────────────────────────────────────────────────────────────────────────
// 사용
// ─────────────────────────────────────────────────────────────────────────
//   import { openOverlaysIfAny } from "./_overlay-trigger.mjs";
//   await openOverlaysIfAny(page, route, console);
//   const { ... } = await page.evaluate(audit, { scope: <scope> });

import process from "node:process";

/**
 * 라우트에 모달 트리거가 등록돼 있으면 클릭해서 열고, 감사할 스코프
 * 셀렉터를 돌려준다. 없으면 null.
 *
 * @param {import("playwright-core").Page} page
 * @param {string} route 검사 중인 라우트 경로 (e.g. "/admin/runners")
 * @returns {Promise<string|null>} 모달 스코프 셀렉터 또는 null
 */
export async function openOverlaysIfAny(page, route) {
  const trigger = MODAL_TRIGGERS.find((t) => t.route === route);
  if (!trigger) return null;

  // 트리거 버튼이 아직 lazy 청크 로딩 중일 수 있으므로 짧게 기다린다.
  const btn = page.locator(`[data-open-modal="${trigger.name}"]`).first();
  const count = await btn.count();
  if (count === 0) {
    // 1호: RegisterRunnerModal 은 모달이 lazy 로드되므로 트리거가 늦게 붙는다.
    // admin 라우트 첫 진입에서 동적 import 가 끝나기 전일 수 있다 — 1초 폴링.
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(100);
      if ((await btn.count()) > 0) break;
    }
    if ((await btn.count()) === 0) {
      process.stderr.write(
        `  · [overlay] ${route} 의 data-open-modal="${trigger.name}" 트리거를 찾지 못함 — 모달 자동 오픈 스킵\n`
      );
      return null;
    }
  }

  await btn.click();
  // 모달 마운트 + :modal 토글 시간 — Astryx Dialog 는 useEffect 로 showModal()
  await page.waitForTimeout(400);

  // scopeSelector 가 실제로 매치되는지 확인 — 모달이 안 열렸으면 무의미하다.
  const scope = page.locator(trigger.scopeSelector).first();
  const scopeCount = await scope.count();
  if (scopeCount === 0) {
    process.stderr.write(
      `  · [overlay] ${route} 의 scope "${trigger.scopeSelector}" 가 모달 오픈 후에도 없음 — 가드 2차 패스 스킵\n`
      + `    (모달이 안 열렸거나 selector 가 변경됐을 수 있음)\n`
    );
    // 모달을 닫지 않는다 — 다음 라우트 컨텍스트가 닫음.
    return null;
  }

  return trigger.scopeSelector;
}

/**
 * 모달 트리거 등록소. 모달을 새로 추가할 때:
 *   1) 마크업에 `data-open-modal="<name>"` 어트리뷰트 박기
 *   2) 아래에 `{ route, name, scopeSelector }` 한 줄 추가
 * 끝.
 *
 * scopeSelector 는 모달 컨테이너 셀렉터 (testid / role / className) —
 * 가드 2차 패스의 감사 범위를 그 안으로 좁힌다.
 */
export const MODAL_TRIGGERS = [
  {
    route: "/admin/runners",
    name: "register-runner",
    // TASK-137 에서 RegisterRunnerModal 의 Dialog 에
    // data-testid="register-runner-modal" 을 박아두었다.
    scopeSelector: '[data-testid="register-runner-modal"]'
  }
  // 예) 향후 모달 추가 시:
  // {
  //   route: "/some/route",
  //   name: "some-modal",
  //   scopeSelector: '[data-testid="some-modal"]'
  // }
];
