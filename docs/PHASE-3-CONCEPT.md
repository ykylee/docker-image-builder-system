# Phase 3 개발 컨셉 — 호스팅 능력 (build/deploy → managed hosting)

- 문서 목적: Phase 3(호스팅 능력)의 컨셉 근거 + 아키텍처 결정 + 마일스톤 + 완료 기준 + 리스크.
- 범위: 빌드된 이미지를 **지속적으로 서빙**하고 URL(context path)로 접근·**관리**하는 능력.
- 대상 독자: 개발자, 운영자, AI 에이전트, workflow 설계자
- 상태: **완료 (P3-M1~M5 전부 봉인, 2026-07-24). Phase 3 완료 판정 §9 충족 — 실 e2e ALL PASS.**
- 최종 수정일: 2026-07-24
- 관련 문서: [Phase 2 컨셉](./PHASE-2-CONCEPT.md), [k8s 배포/webhook 운영](./operations/k8s-deploy-webhook-2026-07-24.md), [CHANGELOG](../CHANGELOG.md)

## 1. 컨셉 한 줄

**"이미지를 만들어 배포까지"에서 "서비스로 띄워 URL 로 접속·관리까지"로.** 각 서비스에 내부 포트와 URL context path 를 부여하고, 목록·상태·기동/중지·제거를 관리한다.

## 2. 왜 이 축인가 (실측 gap)

Phase 2(v0.3.0)까지의 파이프라인은 `build → container test → deploy → result delivery` 다. 하지만 **"deploy"는 아직 호스팅이 아니다**:

| 실측 | 현재 상태 |
|---|---|
| `runtimeUrl` | **컨테이너 테스트용 임시 컨테이너**의 host port URL — 테스트 종료 후 소멸(durable 아님). `apps/runner/internal/services/build_service.go` 의 `containerStatus.RuntimeURL`. |
| k8s 배포(P2-M5) | `Deployment + Service`(ClusterIP)만 생성 — **외부 라우팅(Ingress/경로) 없음**. 배포된 앱에 접근할 URL 이 없다. `deploy/k8s_kubectl.go` 의 `renderK8sManifest` 는 Namespace/Deployment/Service 3-doc 만. |
| 라우팅 | reverse proxy / Ingress / context-path 라우팅 **전무**. |
| 관리 | 호스팅 registry / 서비스 목록·상태·기동/중지/제거 API **전무**. admin 은 runner 관리만. |

즉 Phase 3 는 P2-M5 의 배포를 **지속적·라우팅·관리되는 호스팅**으로 승격하는 축이다.

## 3. 아키텍처 결정 (진입 결정 2종 — 확정)

### 3.1 호스팅 런타임 = **k8s Ingress** (2026-07-24 확정)

P2-M5 의 k8s 배포(Deployment+Service) 위에 **Ingress** 를 얹어 경로 라우팅을 제공한다. 재시작/헬스체크/스케일은 k8s 가 관리한다(별도 프로세스 관리 불필요). 전제: 클러스터에 **Ingress 컨트롤러**(예: ingress-nginx) 가 있어야 한다(kind 는 설치 가능).

> **"포트 할당"의 재해석**: 사용자 초기 구상은 host port 할당(단일 호스트 reverse-proxy 모델)이었으나, k8s Ingress 를 택하면 **host port 를 직접 할당하지 않는다** — k8s Service(ClusterIP)가 포트를 내부 추상화하고 Ingress 가 경로로 라우팅한다. Phase 3 에서 "포트"는 **앱이 컨테이너 안에서 listen 하는 내부 포트(containerPort)의 선언·검증**으로 좁혀지고, 외부 식별자는 **context path** 가 된다. 호스팅 registry 는 (app → contextPath → namespace/service/containerPort → status) 를 관리한다.

### 3.2 URL 스킴 = **path-prefix (context path)** (2026-07-24 확정)

`https://<host>/<context-path>/...` 형태. Ingress 가 `path: /<context-path>` 규칙으로 해당 서비스로 라우팅한다.

### 3.3 배포 = 호스팅 (통합, 2026-07-24 확정)

P2-M5 의 k8s 배포 경로에 **Ingress 를 더해 "배포하면 곧 호스팅됨"으로 일원화**한다. 별도 host stage 를 두지 않는다 — deploy 단계가 Deployment+Service+**Ingress** 생성 + context-path 라우팅까지 책임진다. `deploy` 블록/`runtimeUrl` 이 곧 호스팅 상태·URL 이 된다.

## 4. ⚠️ 핵심 난제 — sub-path 라우팅과 앱 base path

path-prefix 호스팅의 고전적 함정을 **설계에서 정면으로 다뤄야 한다**:

- 브라우저가 `https://host/app-foo/` 를 열면, 앱이 **절대경로 자산**(`/main.js`, `/api/x`)을 참조할 경우 브라우저는 `https://host/main.js` 를 요청 → context path 밖으로 나가 404.
- Ingress `rewrite-target` 로 prefix 를 strip(`/app-foo/x` → `/x`)해도 **앱이 자기 base path 를 모르면** 생성하는 링크/자산 URL 이 여전히 절대 루트 기준이라 깨진다.
- 이건 특정 프레임워크 문제가 아니라 sub-path 호스팅의 본질적 제약이다.

**Phase 3 의 입장(정직한 범위 설정)**:

1. **1급 지원 대상**: base path 를 인식하는(또는 상대경로만 쓰는) 앱. 시스템이 배포 시 **`APP_BASE_PATH=/<context-path>/` env 를 주입**하고, 앱이 이를 읽어 자산/링크 prefix 로 쓰도록 규약화한다(문서 + 예제). SPA 는 빌드 시 base 를 받는 게 표준(vite `base`, CRA `homepage`, Next `basePath`).
2. **보조**: HTML 응답에 `<base href="/<context-path>/">` 주입 옵션(상대경로 앱 구제) — 단, 절대경로/JS fetch 는 못 구제하므로 best-effort.
3. **제약 명시**: 절대경로를 하드코딩한 앱은 path-prefix 로 온전히 호스팅되지 않음을 문서에 못박는다. (완전 격리가 필요하면 후속에서 subdomain 스킴 옵션 추가 — Phase 3 범위 밖.)

이 결정이 P3-M4 의 중심이다.

## 5. 마일스톤 (초안)

Phase 2 의 "계약 선행" 원칙을 유지한다.

### P3-M1 — 계약 + 호스팅 registry
- **대상**: shared-contract + db + build-server
- **내용**: `HostedService` 계약(app / contextPath / namespace / containerPort / status / url / createdAt), context-path **할당·유일성 검증**(DNS/URL-safe, 예약어 회피), DB migration(신규 `hosted_service` 테이블 또는 build_request 확장), build-server 관리 API 골격.
- **완료 기준**: context-path 할당/충돌 거부가 계약+저장소에 존재하고 단위 테스트로 검증.

### P3-M2 — Ingress adapter (배포 → 라우팅)
- **대상**: `apps/runner/internal/deploy`
- **내용**: `kubectlDeployer` 확장 — manifest 에 **Ingress** 추가(`path: /<context-path>`, rewrite 정책). 배포 결과 `runtimeUrl = https://<host>/<context-path>/`. Ingress 컨트롤러 전제 명시.
- **완료 기준**: 배포 시 Ingress 가 생성되고 `runtimeUrl` 이 build status 에 반영.

### P3-M3 — 관리 라이프사이클
- **대상**: build-server 관리 API + build-monitor admin
- **내용**: 호스팅 서비스 **목록 / 상태(k8s 실측) / 기동·중지(scale 0↔1) / 제거(Deployment+Service+Ingress 삭제 + context-path 반환) / 재배포**. admin UI.
- **완료 기준**: 운영자가 UI/API 로 호스팅 서비스를 관리할 수 있고 상태가 k8s 실측과 정합.

### P3-M4 — sub-path 대응 (§4)
- **내용**: `APP_BASE_PATH` env 주입 규약 + Ingress rewrite 정책 확정 + `<base>` 주입 옵션 + **제약/사용 가이드 문서**. base-path-aware 예제 앱.
- **완료 기준**: base-path-aware 앱이 `host/<context-path>/` 로 자산 포함 정상 로드됨을 e2e 로 실증.

### P3-M5 — e2e + 운영
- **내용**: kind + **ingress-nginx** 로 실제 path-routed 접속(`host/<context-path>/` → HTTP 200 + 자산) + 관리 라이프사이클(기동/중지/제거) e2e 1종. 운영 문서.
- **완료 기준**: 신규 e2e ALL PASS + 운영자 end-to-end 확인 가능.

## 6. 순서와 원칙

```
P3-M1 계약/registry → P3-M2 Ingress → P3-M3 관리 → P3-M4 sub-path → P3-M5 e2e
```

- 계약 선행(Phase 2 자산). memory/postgres 동일 semantics. 각 마일스톤에 e2e 포함. 한 마일스톤 = 한 sync commit + workflow meta 갱신.
- P2-M5 의 `kubectlDeployer` / `RUNNER_K8S_*` / 호스팅 e2e 하네스(`e2e-k8s-deploy.sh`) 를 재사용·확장한다.

## 7. 리스크

| 리스크 | 완화 |
|---|---|
| **sub-path 자산 깨짐**(§4) | 1급 지원을 base-path-aware 앱으로 한정 + `APP_BASE_PATH` 규약 + 제약 문서화. subdomain 은 후속. |
| Ingress 컨트롤러 전제(kind 기본 미포함) | e2e 스크립트가 ingress-nginx 설치를 포함. 운영 문서에 전제 명시. |
| context-path 충돌/재사용 | registry 가 유일성 강제 + 제거 시 반환. 예약 경로(/api, /admin, /health, /openapi) 회피. |
| 다중 호스팅 서비스의 자원 누수(중지 안 된 배포) | 관리 라이프사이클(제거)에서 Deployment+Service+Ingress+namespace 정리 보장(P2-M5 Cleanup 확장). |
| "포트 할당" 기대와 k8s 추상화의 간극 | §3.1 에 재해석 명시 — 외부 식별자는 context path, 포트는 내부 선언. |

## 8. 진입 전 결정 (2026-07-24 확정)

1. ~~context-path 출처~~ — **결정: 사용자 지정 우선 + app name 파생 fallback.** 빌드 요청에 context-path 를 명시하면 그것을, 없으면 app name 을 URL-safe 로 정규화해 자동 부여. registry 가 유일성 강제 + 예약 경로(/api·/admin·/health·/openapi·/docs) 회피.
2. ~~host(도메인) 설정~~ — **결정: 단일 base host env `HOSTING_BASE_HOST`.** dev 는 평문(nip.io/localhost). TLS(cert-manager/와일드카드)는 후속.
3. ~~호스팅 vs 배포의 관계~~ — **결정: 통합(배포=호스팅).** §3.3 — k8s 배포 경로에 Ingress 를 더해 일원화. 별도 stage 없음.
4. ~~서비스당 버전 수명~~ — **결정: 앱당 1개 활성 호스팅.** 재배포 시 rolling update 로 교체(동일 Deployment/context-path). 다중 버전 병존·TTL·유휴 eviction 은 후속.
5. ~~Ingress 컨트롤러~~ — **결정: ingress-nginx**(범용, kind 설치 쉬움, e2e 검증 용이).

## 9. Phase 3 완료 판정 (2026-07-24 충족)

- ✅ 빌드된 이미지가 k8s 에 **지속 호스팅**되고 `http(s)://<host>/<context-path>/` 로 접근된다 — **실 e2e(kind+ingress-nginx)로 자산 포함 로드 실측**(base-path-aware 앱 + `APP_BASE_PATH`).
- ✅ 호스팅 서비스가 **관리**된다: 목록/기동·중지/제거가 API(admin) + UI(`/admin/hosting`)로 동작, 실 kubectl(K8sAdmin)로 scale/delete 실측.
- ✅ context-path **유일성** 강제(`CONTEXT_PATH_TAKEN`) + 제거 시 Deployment/Service/Ingress 정리 + context-path 반환.
- ✅ 신규 e2e(`apps/runner/scripts/e2e-hosting.sh`: path-routed 접속 + 관리 라이프사이클) **ALL PASS**.
- ✅ 회귀 baseline 후퇴 없음: TS 5 clean / build-server 198 / build-monitor 279 / go 8 pkg / skill_mcp 225 / migration 0001~0010.

**→ Phase 3 완료(2026-07-24).** 마일스톤 P3-M1~M5 전부 봉인(TASK-166~170). 다음: v0.4.0 릴리스 태깅 검토(사용자 결정 대기).
