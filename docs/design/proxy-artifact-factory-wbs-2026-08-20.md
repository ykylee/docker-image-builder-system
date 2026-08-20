# Proxy Artifact Factory WBS 및 로드맵

## 마일스톤

| Milestone | 범위 | 진입 조건 | 완료 게이트 |
|---|---|---|---|
| M0 계약 | profile/manifest/error/retry | TASK-195 설계 승인 | 계약 drift 및 fixture PASS |
| M1 Proxy MVP | registry mirror + Node/npm proxy | M0 완료 | hit/miss/deny/integrity PASS |
| M2 Runner 연동 | internal endpoint/profile/prefetch | M1 fixture 안정화 | credential 비노출 + retry cap PASS |
| M3 운영 hardening | RBAC/allow-list/metrics/retention | M2 통합 PASS | security/observability PASS |
| M4 staging gate | full e2e/장애주입/rollback | M3 완료 | 운영 승인 또는 명시적 보류 |
| M5 확장 | Python/Maven/Go adapter | M4 채택 결정 | ecosystem별 독립 gate |

## WBS

| WBS | 작업 | 산출물 | 선행 | 완료 기준 |
|---|---|---|---|---|
| 1.1 | Artifact profile 계약 | shared contract schema | - | factory URL/ecosystem/mode 검증 |
| 1.2 | Manifest/digest 계약 | manifest type + parser | 1.1 | lock/base/recipe digest 단언 |
| 1.3 | Error/retry 계약 | 오류 enum + mapping | 1.1 | 5개 오류와 retry cap 단언 |
| 2.1 | Registry mirror fixture | compose/example | 1.x | `FROM @sha256` hit/miss PASS |
| 2.2 | npm proxy fixture | compose/example | 1.x | metadata/tarball integrity PASS |
| 2.3 | Upstream allow-list/deny fixture | policy config + tests | 2.1/2.2 | 비허용 host 차단 |
| 2.4 | Cache volume/health/retention | ops config/runbook | 2.1/2.2 | restart/eviction 정책 확인 |
| 3.1 | Runner profile parsing | config + unit tests | 1.1 | production fail-closed |
| 3.2 | Docker/npm profile 주입 | BuildImage integration | 2.x/3.1 | internal endpoint 사용 |
| 3.3 | Prefetch client | Runner client + contract | 1.3/2.2 | idempotent prefetch |
| 3.4 | Retry orchestration | BuildService flow | 3.3 | build당 1회 재시도 |
| 3.5 | Secret redaction/cleanup | tests + logs | 3.2 | history/layer/log 누출 0 |
| 4.1 | Factory auth/RBAC | role/policy | 3.x | read/prefetch와 eviction 분리 |
| 4.2 | Digest/signature policy | verifier + tests | 1.2/2.x | mutable tag 거부 |
| 4.3 | Metrics/audit | metrics/log/runbook | 3.x | buildId/runnerId/artifactId 추적 |
| 4.4 | Retention/eviction | policy + dry-run | 2.4/4.1 | 참조 중 삭제 방지 |
| 5.1 | Full e2e matrix | scripts/CI | 3.x/4.x | hit/miss/deny/integrity/auth/retry PASS |
| 5.2 | 장애주입/복구 | staging runbook | 4.x | proxy/registry restart와 rollback |
| 5.3 | 채택 판정 | decision record | 5.1/5.2 | adopt/hold 결정 및 후속 TASK |

## Critical path

`1.1 → 1.2/1.3 → 2.1/2.2 → 3.1/3.2 → 3.3/3.4 → 4.1/4.2 → 5.1 → 5.2 → 5.3`

2.3, 2.4, 4.3, 4.4는 M1 이후 병렬화할 수 있지만 M4 staging gate 전에는 완료해야 한다.

## 로드맵 연결

- Phase 1: M0~M1 — build dependency 경계를 내부 endpoint로 고정
- Phase 2: M2~M3 — Runner 실행 경계와 credential/observability hardening
- Phase 5: M4 — staging 운영 승인, retention/rollback/alert 검증
- 후속: M5 — ecosystem 확대 및 private beta quota/비용 모델 연결
