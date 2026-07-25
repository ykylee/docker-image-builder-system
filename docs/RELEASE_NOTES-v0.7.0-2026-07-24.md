# Release Notes — v0.7.0 (2026-07-24)

- 문서 목적: `v0.7.0` (호스팅 status 캐시) 의 종합 리뷰.
- 범위: `v0.6.0` 이후 TASK-174 코드 델타
- 대상 독자: 운영자, release reviewer, AI agent
- 상태: stable
- 최종 수정일: 2026-07-24
- 관련 문서: [CHANGELOG](../CHANGELOG.md), [호스팅 운영](./operations/hosting-2026-07-24.md), [Release Notes v0.6.0](./RELEASE_NOTES-v0.6.0-2026-07-24.md) [v0.5.0](./RELEASE_NOTES-v0.5.0-2026-07-24.md) [v0.4.0](./RELEASE_NOTES-v0.4.0-2026-07-24.md)

## 1. 요약

호스팅 서비스의 **live k8s 상태를 주기적으로 캐시**하는 minor release. `v0.6.0` 까지 `HostedService.status` 는 desired lifecycle(관리 명령·배포 upsert 로만 갱신) 만 있어서, 실 k8s 파드 crash/OOM 으로 `replica=0` 이 된 경우를 운영자가 알 방법이 없었다. 본 release 가 desired status 와 분리된 live read cache 를 추가해 UI 가 degraded 신호를 파생 표시할 수 있게 했다.

- 코드 델타: **TASK-174**
- 5 package.json: `0.6.0` → **`0.7.0`**
- git tag: **`v0.7.0`**
- 회귀 baseline: build-server **199 → 205** (+6 신규) / build-monitor vitest **275 → 279** / TS 5 clean / migration **0001~0012**
- **API 호환 확장** (HostedService 에 2 nullable 필드 추가) — major 변경 없음

## 2. 무엇이 생겼나 — live replica read cache

desired `status`(STOPPED / RUNNING / REMOVED ...) 와 별도로 **실 k8s 상태**를 캐시. 관리 명령과 sync 가 충돌하지 않도록 두 layer 분리.

- **분리 설계** — HostedService 에 optional 2 필드 추가: `availableReplicas`(int nonneg nullable) + `lastSyncedAt`(datetime nullable). `status=RUNNING` 인데 `availableReplicas=0` 이면 UI 가 **degraded** 배지로 파생 표시. 단언: `degraded = (status == RUNNING) && (availableReplicas == 0 || lastSyncedAt 이 임계 초과)`.
- **주기 sync** — build-server 가 프로세스 최초의 background job(`setInterval(..., interval).unref()`)으로 REMOVED 제외 전 서비스의 실측 available replica 를 `kubectl get deploy <name> -o jsonpath='{.status.availableReplicas}'` 로 읽어 캐시. 개별 서비스 조회 실패는 격리(stale 유지 + 다음 tick 재시도) — sync 자체는 한 서비스 실패가 다른 서비스에 영향 없게.
- **opt-in** — `HOSTING_BASE_HOST` 설정 시에만 스케줄러 기동(미설정 배포는 kubectl 호출 0). `HOSTING_STATUS_SYNC_INTERVAL_MS`(기본 30s, `0`=비활성)로 간격 제어. 재배포 시 캐시 null 리셋.
- **UI** (`/admin/hosting`) — Replicas 컬럼 추가 + degraded 배지(노란색) + `lastSyncedAt` tooltip. 정렬은 `lastSyncedAt DESC` 으로 운영자가 최근 sync 부터 본다.

## 3. 후속 patch

없음. 본 release 직후 `v0.7.0` → `v0.8.0` 으로 minor 가 직행. v0.8.0 부터는 k8s adapter 운영 결함 3종(TASK-175) + 후속 운영 보강 patch 5종(v0.8.1~0.8.5) 으로 분기.

## 4. 검증

| 스위트 | 결과 |
|--------|------|
| build-server `node --test` | **205 PASS** (+6 신규 hosting.status.sync) |
| build-monitor `vitest run` | **279 PASS** (불변) |
| `tsc --noEmit` × 5 packages | **clean** |
| postgres migration | **0001~0012** (migration 0012 신규: `available_replicas` INTEGER + `last_synced_at` TIMESTAMPTZ) |
| 부팅 스모크 (스케줄러 기동 + health) | **ALL PASS** |

## 5. 업그레이드 안내

- **API 계약(호환 확장)** — HostedService 에 `availableReplicas`/`lastSyncedAt` nullable 필드 추가. 기존 consumer 가 두 필드 무시해도 정상 동작. 신규 consumer 가 두 필드 읽기 가능.
- **DB** — migration 0012 (`available_replicas` INTEGER + `last_synced_at` TIMESTAMPTZ, `ADD COLUMN IF NOT EXISTS`) — build-server 자동 bootstrap 경로에서 적용. 운영 환경에서 staging dry-run 권장.
- **신규 env(선택)**:
  - `HOSTING_BASE_HOST` — 미설정 시 스케줄러 자체가 비활성 (기존 정합). 본 release 부터 status cache 가 첫 운영권이 됨.
  - `HOSTING_STATUS_SYNC_INTERVAL_MS` — 기본 30s, `0` 이면 비활성.
- **kubectl 호출** — 본 release 가 `kubectl` 을 빌드 서버에서 호출하는 첫 운영권. 운영 환경에 `kubectl` binary + 유효 kubeconfig 가 있어야 sync 가 동작. 미설치 시 sync 자체가 비활성 (`syncHostedServiceStatuses` 가 catch 후 no-op).
- **Rollback** — `git checkout v0.6.0`. migration 0012 는 컬럼 추가라 롤백 시 column drop 불요(미사용). 단, v0.7.0 의 build-server 가 column 을 읽으려 시도해 query error 가능 — 운영 환경은 image rollback 시 build-server 도 같이 rollback.

## 6. follow-up (v0.8.0 후보)

- **k8s adapter 확장** (E1 per-build namespace / E2 Ingress cleanup / E3 k8s 실패 시 docker registry 결과 보존) — v0.7.0 의 status cache 가 drift 를 잡을 수 있게 됐으니, 그 drift 의 **원인**(k8s adapter 의 운영 결함 3종) 을 해소하는 방향. ([CHANGELOG §7](../CHANGELOG.md))
- webhook 확장(Slack·재시도·서명) / 실 k8s e2e sync 캐시 실측.

## 7. 종합 release notes 정합

본 문서는 v0.8.6 (2026-07-25) patch 에서 사후 작성. v0.7.0 release commit(`5ff9939`) 와 TASK-174 commit(`5c17dd8`) 의 본문을 종합 리뷰 형태로 정리. CHANGELOG release history v0.7.0 entry 에 본 문서 링크 추가.
