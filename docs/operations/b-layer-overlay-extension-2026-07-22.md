# B층 가드 오버레이(모달) 검사 확장 (TASK-148)

- 문서 목적: B층 가드(check-theme-contrast / check-css-leak)가 라우트별 모달을 자동으로 열어 감사하도록 확장한 작업의 의도, 구조, 사용법, 한계를 정리한다.
- 범위: `data-open-modal` 트리거 규약, `_overlay-trigger.mjs` 공용 helper, 가드 두 종류의 변경, 추후 모달 추가 절차
- 대상 독자: 개발자, AI agent, 프론트 가드 운영자
- 상태: stable
- 최종 수정일: 2026-07-22
- 관련 문서: [테마별 시각 회귀 가드](theme-contrast-guard-2026-07-21.md), [PROJECT_PROFILE](../PROJECT_PROFILE.md)

## 1. 왜 하는가

TASK-137 회고가 B층 가드의 사각지대를 이렇게 적었다.

> "B층 가드가 모달을 열지 않아 오버레이는 검사 범위 밖. sr-only 'Close' 는 rect 0×0 이라 isVisible 이 정확히 건너뜀 — 오탐 우려는 없음 확인."

즉 **모달 안의 텍스트·버튼·입력 라벨은 감사 대상에서 빠져 있었다**. 모달은 사용자 상호작용으로만 열리고, 페이지 초기 진입 상태에는 DOM 에 없기 때문이다. CSS 유출 가드(TASK-146) 가 admin/runners 에서 Register Runner 모달을 인라인으로 클릭해 열었던 것은 한정적 — 그 외 모달(미래 포함)은 자동으로 열리지 않았다.

본 TASK 는 그 사각지대를 **generic 트리거 규약**으로 메운다. 모달을 새로 추가해도 가드 코드 변경이 거의 없도록.

## 2. 트리거 규약

### 2.1 마크업 측

모달을 여는 버튼(또는 트리거 요소)에 어트리뷰트 **한 줄**을 박는다.

```tsx
<button
  type="button"
  onClick={() => setRegisterModalOpen(true)}
  data-testid="admin-runners-register"
  // TASK-148: B층 가드가 이 어트리뷰트로 모달을 자동으로 열어 감사.
  // 트리거 이름은 가드 MODAL_TRIGGERS 의 `name` 과 일치해야 한다.
  data-open-modal="register-runner"
>
  + Register Runner
</button>
```

- `data-open-modal` 은 **가드 전용 셀렉터**. 사람·AT(보조기술) 대상이 아니므로 시각·a11y 영향 0.
- 값(예: `register-runner`)은 가드 `MODAL_TRIGGERS[].name` 과 일치.
- 모달 컨테이너에는 이미 `data-testid="register-runner-modal"` 같은 스코프용 어트리뷰트가 TASK-137 에서 박혀 있다. 가드는 그것을 `scopeSelector` 로 참조.

### 2.2 가드 측

`apps/build-monitor/scripts/_overlay-trigger.mjs` 의 `MODAL_TRIGGERS` 배열에 한 줄:

```js
export const MODAL_TRIGGERS = [
  {
    route: "/admin/runners",
    name: "register-runner",
    scopeSelector: '[data-testid="register-runner-modal"]'
  }
  // 예) 향후 모달 추가:
  // { route: "/some/route", name: "some-modal", scopeSelector: '[data-testid="some-modal"]' }
];
```

| 필드 | 의미 |
|---|---|
| `route` | 가드가 검사하는 라우트 경로. 일치할 때만 트리거를 시도. |
| `name` | `data-open-modal` 의 값. |
| `scopeSelector` | 모달 컨테이너를 가리키는 CSS 셀렉터(testid / role / className). 가드 2차 패스의 감사 범위를 그 안으로 좁힘. |

## 3. 동작 흐름

B층 가드 두 종류는 같은 helper 를 호출한다. 라우트당 두 패스로 감사.

### 3.1 1차 패스 (페이지 진입 직후)

기존과 동일. 페이지 전체를 감사한다. 모달 바깥 요소가 잡힌다.

### 3.2 helper: `openOverlaysIfAny(page, route)`

1. `MODAL_TRIGGERS` 에서 `route` 매치를 찾는다.
2. 매치가 없으면 `null` 반환 → 2차 패스 없음. (기존 동작 그대로)
3. 매치가 있으면 `[data-open-modal="<name>"]` 셀렉터로 트리거 버튼을 찾는다. Register Runner 같이 모달이 **지연 로드**되는 경우 트리거가 늦게 붙을 수 있어 최대 2초 폴링.
4. 트리거를 `click()` 하고 400ms 대기 (Astryx Dialog `useEffect` → `showModal()` 토글 시간).
5. `scopeSelector` 가 DOM 에 존재하면 그 셀렉터를 반환. 없으면 `null` + stderr 경고.

### 3.3 2차 패스 (모달 오픈 후)

`auditInPage(..., { scope: <scopeSelector> })` 호출. `auditInPage` 는 `document.body` 대신 `document.querySelector(scope)` 부터 tree-walk 한다. **모달 바깥은 1차에서 이미 감사했으므로 중복 없이 모달 안만 본다**.

오버레이에서 잡힌 위반/하이재킹에는 prefix **`오버레이: `** 를 붙여 어느 패스에서 잡혔는지 분명히 한다. 예:

```
✗ [dark] /admin/runners
    대비 3.2:1 < 4.5:1 — 오버레이: button "Cancel" "Cancel"
      rgb(120, 120, 120) on rgb(35, 35, 40), 14px/500
```

## 4. 사용법

가드 사용법은 기존과 같다. 라우트별 모달 자동 오픈은 **투명하게 추가**됐다.

```bash
cd apps/build-monitor

# 대비 가드
pnpm check:theme-contrast

# CSS 유출 가드
pnpm check:css-leak
```

새 라우트에 모달이 추가되면 라우트 인자에 추가만 하면 된다:

```bash
pnpm check:theme-contrast --routes /login,/builds,/build-request,/admin/builds,/admin/runners
```

## 5. 한계 / 주의

- **단일 모달 동시 오픈 가정**: 한 라우트에서 두 개 모달이 동시에 뜨는 케이스(예: confirm + form)는 2차 패스에서 한쪽만 잡힐 수 있다. 현재 앱에 그런 라우트는 없다.
- **모달 안 모달 (nested)**: Astryx Dialog 는 nested 를 차단하니 우리도 안전. 만약 다른 모달 라이브러리로 바꿔 nested 가 가능해지면 helper 가 트리거를 두 번 클릭해야 한다 — 후속 결정.
- **모달 오픈이 사이드이펙트를 가진 경우**: 클릭 → 모달 열림 외에 fetch 호출 같은 게 일어나면 가드 실행 중 추가 요청이 발생한다. Register Runner 모달은 열기만 해도 호출이 없으니 안전. 새 모달을 추가할 때 열기 사이드이펙트가 있으면 helper 에 가드(예: 모달이 닫힐 때 호출 부재 확인)를 더해야 할 수 있다.
- **모달 오픈을 못 찾는 경우**: `data-open-modal` 누락 / 트리거가 조건부로만 렌더 / 모달이 트리거를 통하지 않고 코드로 직접 토글 — 이 경우 helper 는 2초 폴링 후 `null` 반환 + stderr 경고. **fail-open** 으로 동작하므로 가드가 죽지는 않지만, 사각지대가 조용히 남을 수 있다. CI 통합 시 이 stderr 경고가 보이면 즉시 modal 트리거 누락으로 본다.

## 6. 추후 모달 추가 절차 (1분)

1. **마크업** — 모달을 여는 버튼에 `data-open-modal="<name>"` 한 줄.
2. **모달 컨테이너** — 이미 testid 같은 식별자가 있을 것. 없으면 `data-testid="<name>-modal"` 박기.
3. **가드** — `_overlay-trigger.mjs` 의 `MODAL_TRIGGERS` 에 한 줄.
4. **회귀** — `pnpm check:theme-contrast` 와 `pnpm check:css-leak` 둘 다 라우트 추가해서 정상 통과 확인.

코드 / SQL / schema / migration / version / git tag 변경은 모달 본체에 따라 다르지만 **가드 측 변경은 helper 한 줄 + 마크업 어트리뷰트 한 줄** 로 끝난다.
