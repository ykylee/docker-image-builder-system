# skill_mcp 실서버 검증 + 소비자 정렬 (TASK-163 / P2-M4)

- 문서 목적: skill_mcp 와 build-monitor 를 canonical 모델에 정렬하고, skill_mcp 를 **실행 중인 Build Server 대상**으로 검증하는 경로를 신설한 내역을 남긴다. 그 검증이 즉시 잡아낸 결함 3건도 함께 기록한다.
- 범위: skill_mcp preview-era 청산 · 스킬 개명 · 실서버 검증 스크립트 · build-monitor 실패 이유 배너 · 계약의 nullable 산출 결함
- 대상 독자: 개발자, AI agent, 운영자
- 상태: stable
- 최종 수정일: 2026-07-23
- 관련 문서: [Phase 2 컨셉](../PHASE-2-CONCEPT.md), [컨테이너 테스트 엔드포인트](container-test-endpoints-2026-07-23.md), [빌드 실패 보고 경로](build-failure-reporting-2026-07-23.md), [DESIGN.md](../DESIGN.md)

## 1. 왜 "실서버 검증" 이 완료 기준이었나

Phase 2 컨셉 §7 이 리스크로 명시한 것:

> `skill_mcp` 가 단위 테스트만 통과 (실서버 미검증)

skill_mcp 는 TASK-069 이후 손대지 않은 채 단위 테스트 222건이 green 이었다. 그런데 **그 테스트는 전부 손으로 만든 payload 를 넣는다** — 서버가 실제로 무엇을 내보내는지와 무관하다. 그 사이 P2-M1~M3 에서 서버 응답이 크게 바뀌었다:

| 변경 | 마일스톤 |
|---|---|
| `previewStatus` / `previewTtlMinutes` 제거 | P2-M1 |
| `testDeployment` 응답·엔드포인트 제거, `previewUrl` → `runtimeUrl` | P2-M2 |
| `lastError` 가 **처음으로 실제 기록**되기 시작 | P2-M3 |

단위 테스트만으로는 이 드리프트를 원리적으로 잡을 수 없다. 그래서 P2-M4 는 **실서버를 상대로 도는 검증**을 만드는 것을 완료 기준에 두었다.

## 2. `apps/skill_mcp/scripts/verify-live-server.sh`

```bash
bash apps/skill_mcp/scripts/verify-live-server.sh
# 이미 떠 있는 서버에 붙이려면
BUILD_SERVER_URL=http://127.0.0.1:3000 bash apps/skill_mcp/scripts/verify-live-server.sh
```

build-server(memory backend)를 띄우고 HTTP 로 빌드를 몰아간 뒤, **서버의 실제 응답을 그대로** 스킬 입력으로 넣는다.

| 단계 | 검증 |
|---|---|
| [1] happy path | 빌드를 `container-test/result{SUCCESS}` 까지 몰고 → `container-test-readiness-checker` 가 `READY` + `next_action=OPEN_DEPLOYMENT` + **서버가 기록한 `runtimeUrl`** 을 subtitle 로 합성하는지. `latest-build-status` live 호출이 canonical 응답을 **경고 0** 으로 해석하는지 |
| [2] failure path | 빌드를 `container-test/result{FAILED, errorCode}` 로 몰고 → 서버가 `lastError` 를 실제로 기록했는지, `failure-summary-shaper` 가 `stage=TEST` + **서버가 준 canonical errorCode** 를 그대로 전달하는지 |

종료 코드: `0` 전부 PASS / `1` 단언 실패 / `3` 전제 미충족.

## 3. 그 검증이 즉시 잡은 결함 3건

만들자마자 셋을 잡았다. **셋 다 단위 테스트 222건이 green 인 채로 존재하던 것**이다.

### 3.1 MCP 가 canonical 블록을 전부 버리고 있었다

`latest-build-status` 의 `_normalize_build` 가 `build` 키를 **전송 envelope 처럼 unwrap** 했다:

```python
for wrap_key in ("data", "result", "build", "payload"):   # ← "build" 가 섞여 있었다
    if wrap_key in payload and isinstance(payload[wrap_key], dict):
        payload = payload[wrap_key]
```

canonical `BuildStatusResponse` 는 `build` 요약과 **형제** 블록(`test` / `deploy` / `lastError` / `lifecycle` / `resultDelivery` / `currentPhase`)으로 구성된다. `build` 를 unwrap 하면 형제가 **전부 사라진다.** 실측:

```
MCP build keys : ['appName', 'buildId', 'createdAt', 'lifecycleStatus', 'status']
test block     : None
lastError      : None
```

AI 에이전트의 주 진입점이 컨테이너 테스트 결과도, 실패 이유도 볼 수 없었다는 뜻이다. 수정: 전송 envelope 만 unwrap 하고, canonical 응답이면 요약과 형제 블록을 **합친다**.

### 3.2 `runtimeUrl` 이 보존 키 목록에 없었다

`_BUILD_TOP_KEYS` allow-list 에 `runtimeUrl` 이 없어(preview-era 의 `previewUrl` 도 마찬가지로 없었다) **"앱이 어디서 돌고 있는지" 를 MCP 소비자가 영영 볼 수 없었다.** 추가했다.

### 3.3 canonical `currentPhase` 는 객체인데 문자열로 가정했다

3.1 을 고치자 즉시 터졌다:

```
TypeError: unhashable type: 'dict'   # phase not in PHASES
```

canonical `currentPhase` 는 `BuildCurrentPhase = { phase, startedAt }` 객체이거나 terminal 에서 `null` 이다. explainer 는 문자열만 가정했다. **두 결함이 서로를 가리고 있었다** — MCP 가 `currentPhase` 를 버리고 있었기 때문에 explainer 의 잘못된 가정이 드러날 기회가 없었다.

수정: `_resolve_current_phase()` 가 객체/문자열 양쪽을 받는다.

## 4. skill_mcp preview-era 청산

- **스킬 개명**: `preview_readiness_checker` → **`container_test_readiness_checker`** (디렉터리 · 테스트 · SKILL.md · CLI). 도메인은 처음부터 container-test readiness 였고, import path 호환을 위해 미뤄둔 이름이었다.
- **제거된 입력 경로**: `testDeployment` (readiness / explainer 양쪽) · `previewFailure` (shaper) · `LEGACY_PREVIEW_STATUSES` / `LEGACY_PREVIEW_TO_EXECUTION` / `is_legacy_preview_status` (canonical.py) · MCP 의 preview forward-map.
- **입력 어휘 개명**: `failure.source: preview` → `test`.
- **subtitle 출처 변경**: `test.containerRef` → **`build.runtimeUrl` 우선**. v2 의 subtitle 에 URL 이 들어오던 것은 legacy 매핑이 `previewUrl` 을 containerRef 자리에 넣어주었기 때문이라, 그 매핑을 지우면 URL 을 영영 못 보게 되는 구조였다.
- 스킬 버전 `v2` → `v3` (readiness / shaper).

`OPEN_PREVIEW` 입력 shim 은 **유지**했다 — 이건 호출자가 손으로 주는 값이라 서버 계약 표면이 아니고, 잘못 주면 조용히 `NONE` 으로 떨어지는 것보다 canonical 로 흡수하는 편이 안전하다.

## 5. build-monitor — 실패 이유 배너

`lastError` 는 P2-M3 전까지 **항상 null 이었다.** BuildDetail 의 "Last error" 행은 늘 `—` 만 찍는 죽은 UI 였다. 이제 실제로 채워지므로 실패한 빌드에서 가장 먼저 봐야 할 정보를 meta 목록 중간이 아니라 **상단 배너**로 올렸다.

- `lastError` 가 있을 때만 렌더 (`data-testid="build-last-error"`), `role="alert"`.
- danger accent 를 **테두리와 코드 라벨에만** 쓰고 배경은 surface 유지 — DESIGN.md §7 "상태색으로 면을 덮지 않는다".
- 성공한 빌드에는 아무것도 렌더하지 않는다. 빈 자리를 `—` 로 채우면 "볼 것이 있다" 는 잘못된 신호를 준다.

`DESIGN.md` 를 **v3** 로 갱신했다.

## 6. 계약 — `lastError` 의 nullable 이 타입에서 사라지고 있었다

프런트 회귀 테스트에 `lastError: null` 픽스처를 넣자 TS 가 거부했다. 생성 타입이 이랬다:

```ts
lastError: components["schemas"]["BuildError"] & unknown;   // null 이 없다
```

**원인**: 이미 등록된($ref) 스키마에 `.nullable()` 을 씌우면 OpenAPI 3.0 산출이 `allOf: [$ref, { nullable: true }]` 가 되고, `openapi-typescript` 는 그 두 번째 항(타입 없는 스키마)을 `unknown` 으로 렌더한다 → nullable 이 증발한다. 문서 자체는 유효한 3.0 이라 서버 쪽에서는 아무 신호도 나지 않았다.

**결과**: 프런트가 `lastError: null`(성공한 빌드의 절대다수)을 타입으로 표현할 수 없었다. UI 코드의 `build.lastError ? ... : "—"` 는 타입상 항상 truthy 였다.

**수정**: object 에 nullable 을 **먼저** 적용한 뒤 등록하는 패턴(`BuildCurrentPhase` 가 이미 쓰던 검증된 방식)으로 `NullableBuildError` 를 만들었다. 필드 정의는 `buildErrorShape` 한 곳에만 둔다.

```ts
const buildErrorShape = { code: z.enum(errorCodes), message: z.string().min(1) };
export const buildErrorSchema = z.object(buildErrorShape).meta({ id: "BuildError", ... });
export const nullableBuildErrorSchema = z.object(buildErrorShape).nullable().meta({ id: "NullableBuildError", ... });
```

생성 타입:

```ts
NullableBuildError: { code: ...; message: string } | null;
```

> **재발 방지**: `$ref` 로 등록된 스키마에 `.nullable()` 을 씌우지 말 것. nullable 이 필요하면 **object 단계에서 nullable 을 적용한 뒤 등록**한다.

## 7. 검증

| 대상 | 결과 |
|---|---|
| TS `tsc --noEmit` 5 packages | clean |
| build-server | **182 PASS** |
| build-monitor vitest | **275 PASS** (실패 배너 회귀 2건 추가) |
| Go `go test ./...` | **8/8 package PASS** |
| skill_mcp pytest | **225 PASS** (+19 subtests) — canonical envelope 회귀 3건 추가 |
| **skill_mcp 실서버 검증** | **ALL PASS** (§2) |
| OpenAPI 재생성 | paths 14 · components **41** (`NullableBuildError` 추가) |
| e2e 13종 | ALL PASS |

### 7.1 음성 검증

새 회귀 가드가 실제로 무는지 확인했다 — MCP 정규화를 개선 전 동작(= `build` unwrap + `runtimeUrl` 미보존)으로 되돌리면 `test_sibling_blocks_survive_normalization` / `test_runtime_url_is_preserved` 가 **FAIL** 한다. 복원 후 전부 PASS.

**단위 테스트 222건은 개선 전에도 green 이었다** — 이 결함들을 잡은 것은 오직 실서버 검증이다. 그 사실 자체가 §1 의 근거를 실증한다.

## 8. 남은 것

- 실서버 검증은 아직 **수동 실행**이다. nightly 워크플로에 붙이는 것은 e2e wrapper 와 같은 자리에서 함께 볼 문제라 별도 항목으로 남긴다.
- `skill_mcp` 의 나머지 preview-era 문구(사용자 대상 한국어 메시지 일부)는 canonical 어휘로 이미 정렬돼 있으나, 톤 재설계는 별도 작업이다.
