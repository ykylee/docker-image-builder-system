# Baseline Decision 02 - Preview Host Structure

- 문서 목적: `OI-004`에 대한 Step 05 baseline decision을 정의한다.
- 범위: preview host topology, host selection point, URL composition responsibility
- 대상 독자: 프로젝트 리드, 플랫폼 운영자, Build Server/Runner 설계자
- 상태: baseline
- 최종 수정일: 2026-07-02
- 관련 문서: `docs/sdlc/SRS/05-open-issues-and-decisions.md`, `docs/sdlc/SRS/04-policy-and-constraints.md`, `docs/sdlc/design/05-build-and-preview-execution-flow.md`

## 1. 결정 ID

- `BD-002`
- source issue: `OI-004`

## 2. 배경

preview host 구조는 `previewUrl`, readiness probe, host/port reservation, cleanup scope에 직접 영향을 준다.

MVP는 운영 단순성을 우선해야 하므로 host topology도 과도하게 복잡하면 안 된다.

## 3. 선택지

### Option A

- 단일 preview host 서버

### Option B

- 여러 preview host의 pool

### Option C

- orchestrator 외부에서 동적으로 host를 할당하는 구조

## 4. 이번 단계 채택안

Option A를 채택한다.

## 5. 채택 이유

- 현재 MVP는 단일 Runner, `host + port`, 문서 중심 설계 단계이므로 단일 host가 가장 검증 비용이 낮다.
- 여러 host pool은 slot scheduling, health routing, host-level cleanup 책임을 동시에 증가시킨다.
- 단일 host로 먼저 구현하고, 향후 pool 구조는 확장 포인트로 남기는 편이 안전하다.

## 6. baseline rule

- MVP preview runtime은 단일 preview host를 사용한다.
- `previewUrl`은 단일 host의 `host + port` 조합으로 생성한다.
- host 선택 책임은 Build Server가 아니라 preview service worker 실행 흐름에 둔다.

예시:

```text
http://preview-host.example.com:38124
```

## 7. 영향 문서

- `docs/sdlc/SRS/04-policy-and-constraints.md`
- `docs/sdlc/SRS/04-policy-and-constraints.md`
- `docs/sdlc/design/01-system-context-and-responsibilities.md`
- `docs/sdlc/design/03-api-contract-design.md`
- `docs/sdlc/design/05-build-and-preview-execution-flow.md`

## 8. 후속 보류 항목

- host redundancy와 장애 복구 모델은 MVP 이후 아키텍처 결정으로 넘긴다.
- reverse proxy 또는 subdomain URL 전략은 현재 제외 범위를 유지한다.
