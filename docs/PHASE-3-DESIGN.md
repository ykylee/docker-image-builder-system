# Phase 3 설계 — 호스팅 능력 (managed hosting)

- 문서 목적: [Phase 3 컨셉](./PHASE-3-CONCEPT.md)의 확정 결정을 **구체 설계**로 — 도메인 모델, 계약, 데이터 모델/마이그레이션, context-path 할당, k8s Ingress manifest, sub-path 메커니즘, 관리 API.
- 범위: P3-M1~M5 의 설계. M1/M2 는 구현 직전 수준, M3~M5 는 계약/골격 수준.
- 대상 독자: 개발자, 리뷰어, AI 에이전트
- 상태: **draft (설계 리뷰 완료 — 결정 확정, P3-M1 착수 대기)**
- 최종 수정일: 2026-07-24
- 관련 문서: [Phase 3 컨셉](./PHASE-3-CONCEPT.md), [k8s 배포/webhook 운영](./operations/k8s-deploy-webhook-2026-07-24.md), [기존 SDLC 설계](./sdlc/design/)

## 0. 확정 결정 (컨셉 §3·§8)

k8s Ingress · path-prefix · **배포=호스팅 통합** · context-path(사용자 지정 우선 + app name 파생) · 앱당 1개 활성(재배포 교체) · ingress-nginx · `HOSTING_BASE_HOST` env.

## 1. 도메인 모델

### 1.1 HostedService 엔티티

앱 1개 = 호스팅 서비스 1개(1 active). 빌드가 성공적으로 배포되면 그 앱의 HostedService 가 생성/갱신된다.

```
HostedService
  appName        앱 정체성 (build_request.app_name 과 동일 — 앱당 유일)
  contextPath    URL prefix (정규화됨, 전역 유일)   e.g. "todo-app"
  namespace      k8s namespace                      e.g. "dib-hosted"
  deploymentName k8s Deployment/Service/Ingress 이름 (dib-<contextPath>)
  containerPort  앱이 컨테이너 안에서 listen 하는 포트  e.g. 8080
  stripPrefix    Ingress 가 context-path prefix 를 strip 하는지 (기본 true, §6)
  status         PROVISIONING | RUNNING | STOPPED | FAILED | REMOVED
  url            https://<HOSTING_BASE_HOST>/<contextPath>/
  currentBuildId 현재 호스팅 중인 build
  imageRef       서빙 중 이미지
  createdAt / updatedAt / lastDeployedAt
```

### 1.2 상태 전이

```
(build 배포 성공) → PROVISIONING → RUNNING
RUNNING ⇄ STOPPED         (관리: stop=scale 0 / start=scale 1)
RUNNING → PROVISIONING     (재배포: rolling update, 같은 contextPath)
any → FAILED               (배포/rollout 실패)
any → REMOVED              (관리: 제거 — k8s 자원 삭제 + contextPath 반환)
```

- **앱당 1개 활성**: 같은 appName 재배포는 기존 HostedService 를 **교체**(같은 Deployment/contextPath 로 rolling update). 새 row 를 만들지 않는다.

## 2. 계약 (shared-contract)

### 2.1 BuildRequest 확장

`packages/shared-contract/src/build/request.ts` 의 `buildRequestSchema` 에 **optional** 필드 2종 추가(하위 호환):

```ts
// 호스팅 context path. 미지정 시 appName 을 정규화해 자동 부여(§4).
contextPath: z.string().min(1).optional(),
// 앱이 listen 하는 컨테이너 내부 포트. 미지정 시 8080.
runtimePort: z.int().positive().default(8080),
```

### 2.2 HostedService 스키마 (신규)

`response.ts` 에 `hostedServiceSchema`(위 엔티티) 등록. build status 응답의 `deploy` 블록과 별개로 **관리 API** 가 반환한다. `status` 는 hosting lifecycle enum(위 §1.2).

### 2.3 관리 API (admin, `admin-routes.ts`)

| method · path | 동작 |
|---|---|
| `GET /admin/hosted-services` | 목록 (registry) |
| `GET /admin/hosted-services/:appName` | 상세 + **k8s 실측 상태**(replica/available) |
| `POST /admin/hosted-services/:appName/stop` | scale 0 → STOPPED |
| `POST /admin/hosted-services/:appName/start` | scale 1 → RUNNING |
| `POST /admin/hosted-services/:appName/redeploy` | 최신 성공 build 로 재배포(선택) |
| `DELETE /admin/hosted-services/:appName` | 제거 — Deployment+Service+Ingress 삭제 + contextPath 반환 → REMOVED |

admin allow-list 가드(기존 `isAdmin`) 공유. 응답은 canonical `HostedService`.

### 2.4 DeploymentReportRequest 확장 (runner → server)

runner 가 배포 성공 보고 시 HostedService upsert 에 필요한 값을 함께 보낸다(§9-2). `DeploymentReportRequest` 에 `contextPath`/`namespace`/`deploymentName` 추가(3-way TS·Go·Python). `runtimeUrl` 은 기존 필드 재사용(호스팅 URL). build-server 는 이 보고로 `hosted_service` 를 appName 기준 upsert(교체).

## 3. 데이터 모델 (packages/db) + 마이그레이션

### 3.1 `hosted_service` 테이블 (신규, `deployment_attempt` 패턴)

```ts
export const hostedServiceTable = pgTable("hosted_service", {
  id: uuid("id").defaultRandom().primaryKey(),
  appName: text("app_name").notNull(),
  contextPath: text("context_path").notNull(),
  namespace: text("namespace").notNull(),
  deploymentName: text("deployment_name").notNull(),
  containerPort: integer("container_port").notNull(),
  stripPrefix: boolean("strip_prefix").notNull().default(true),
  status: text("status").notNull(),
  url: text("url"),
  currentBuildId: uuid("current_build_id"),
  imageRef: text("image_ref"),
  createdAt: timestamp(...).defaultNow().notNull(),
  updatedAt: timestamp(...).defaultNow().notNull(),
  lastDeployedAt: timestamp(...)
}, (t) => ({
  appNameUnique: uniqueIndex("hosted_service_app_name_idx").on(t.appName),      // 앱당 1개
  contextPathUnique: uniqueIndex("hosted_service_context_path_idx").on(t.contextPath) // 전역 유일
}));
```

- **migration 0009** — `hosted_service` 테이블 생성. (build_request 확장이 아니라 별도 테이블 — 앱 생명주기 ≠ 빌드 생명주기.)
- memory 저장소도 동일 구조를 Map<appName, HostedService> + Set<contextPath> 로.

## 4. context-path 할당 (P3-M1 핵심)

```
allocateContextPath(request):
  raw = request.contextPath ?? request.appName
  cp  = normalize(raw)                       # 소문자, [^a-z0-9-]→'-', 연속 '-' 축약, 양끝 '-' 제거
  if cp == "" or cp in RESERVED:  reject INVALID_REQUEST (사유)
  existing = registry.byContextPath(cp)
  if existing and existing.appName != request.appName:  reject CONTEXT_PATH_TAKEN
  return cp                                   # 같은 앱이면 재사용(교체)
```

- `RESERVED = {api, admin, health, openapi, docs, builds, _*}` — build-server 자체 라우트와 충돌 방지.
- 신규 errorCode: `CONTEXT_PATH_TAKEN` (계약 errorCodes 추가, 3-way).
- 정규화 규칙은 `deploymentName`(DNS-1123, P2-M5) 과 정합 — contextPath 가 그대로 k8s 자원 이름 suffix 가 된다.

## 5. k8s Ingress manifest (P3-M2)

`deploy/k8s_kubectl.go` 의 `renderK8sManifest` 를 **Namespace+Deployment+Service+Ingress** 4-doc 으로 확장.

- **Deployment**: 컨테이너 env 에 `APP_BASE_PATH=/<contextPath>/` 주입(§6).
- **Ingress**(ingress-nginx):

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: <name>
  namespace: <ns>
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2   # strip prefix (stripPrefix=true)
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - path: /<contextPath>(/|$)(.*)
            pathType: ImplementationSpecific
            backend:
              service:
                name: <name>
                port:
                  number: <containerPort>
```

- 배포 결과 `runtimeUrl = https://<HOSTING_BASE_HOST>/<contextPath>/` → build status `deploy`/`runtimeUrl` + HostedService.url 에 반영.
- P2-M5 의 `K8sResult` 에 `ContextPath`/`URL` 추가. `Cleanup` 은 Ingress 도 삭제.

## 6. sub-path 메커니즘 (P3-M4 — 컨셉 §4 난제)

**기본(stripPrefix=true)**: Ingress 가 `rewrite-target: /$2` 로 prefix 를 벗겨 앱 서버는 **루트 기준**(`/main.js`)으로 요청을 받는다(대부분의 정적 서버가 이 형태). 브라우저가 `/<cp>/` 에서 로드한 HTML 이 참조하는 자산 URL 은 앱이 **`APP_BASE_PATH` 를 읽어 `/<cp>/main.js` 로 emit** 해야 브라우저가 `/<cp>/main.js` 를 요청 → Ingress 매칭 → strip → 앱이 `/main.js` 서빙. **정합 조건 = 앱이 emit 하는 URL 에만 prefix, 서버 라우팅은 루트.**

**대안(stripPrefix=false)**: 앱이 서버 라우팅까지 base-path-aware(예: Next `basePath`, vite `base`)면 rewrite 없이 pass-through. 이 경우 앱이 `/<cp>/main.js` 를 직접 서빙.

**보조**: HTML 응답에 `<base href="/<cp>/">` 주입 옵션(상대경로 앱 구제, best-effort — 절대경로/JS fetch 는 못 구제).

**제약 문서화**: 절대경로를 하드코딩하고 `APP_BASE_PATH` 미지원 + 상대경로도 아닌 앱은 온전히 호스팅되지 않는다. 1급 지원 대상은 `APP_BASE_PATH` 규약을 따르는 앱. 예제 앱 + 가이드 제공.

## 7. 관리 라이프사이클 → k8s 매핑 (P3-M3)

| API | k8s 동작 | registry |
|---|---|---|
| stop | `kubectl scale deployment/<name> --replicas=0` | status=STOPPED |
| start | `kubectl scale deployment/<name> --replicas=1` + rollout | status=RUNNING |
| status | `kubectl get deployment -o jsonpath`(availableReplicas) | 실측 정합 |
| redeploy | 최신 성공 build 이미지로 `apply` + rollout | lastDeployedAt 갱신 |
| remove | `kubectl delete deployment,service,ingress <name>` | status=REMOVED + contextPath 반환 |

- 관리 동작은 **build-server 가 kubectl 을 직접 shell-out**(신규 서버측 k8s 관리 헬퍼, §9-1). 배포(생성)는 runner, 관리(수명)는 build-server.

## 8. 마일스톤 → 설계 매핑

- **P3-M1**: §2.1·2.2(계약) + §3(테이블+migration 0009) + §4(할당) + §2.3 API 골격(registry CRUD, k8s 미연동). 단위 테스트.
- **P3-M2**: §5(Ingress manifest) + K8sResult 확장 + runtimeUrl 실 URL. deploy 경로가 HostedService 를 upsert.
- **P3-M3**: §7(관리 라이프사이클) + admin UI.
- **P3-M4**: §6(sub-path/APP_BASE_PATH) + 예제 앱 + 가이드.
- **P3-M5**: kind + ingress-nginx e2e(path-routed 접속 + 자산 로드 + 관리 라이프사이클).

## 9. 설계 결정 (2026-07-24 확정)

1. ~~관리 kubectl 호출 주체~~ — **결정: build-server 직접 kubectl.** 관리(scale/delete/status)는 제어평면이므로 관리 API 가 있는 build-server 가 kubectl 을 직접 shell-out 한다. **신규 컴포넌트: build-server 측 k8s 관리 헬퍼**(TS, `kubectl` shell-out — runner 의 `kubectlDeployer` 와 대칭). 전제: build-server 실행 환경에 `kubectl` + kubeconfig(`RESULT`/`HOSTING_KUBE_CONTEXT` 등) 필요 → 운영 문서에 명시. 배포(생성)는 runner, 관리(수명)는 build-server 로 역할 분리.
2. ~~HostedService upsert 시점~~ — **결정: runner 보고 → server upsert.** runner 가 배포 성공 시 `contextPath`(+기존 `runtimeUrl`/namespace/deploymentName)를 **`DeploymentReportRequest` 에 담아 보고**하고, build-server 가 그 보고로 HostedService 를 upsert(appName 기준 교체). 기존 ReportDeployment 흐름과 일관 — 계약에 `contextPath`/`namespace`/`deploymentName` 필드 추가(3-way).
3. **`HOSTING_BASE_HOST` 미설정 시** — **결정: 호스팅 비활성**(k8s 배포만, Ingress 미생성, HostedService 미upsert). 명시적 opt-in.
4. **stripPrefix** — **결정: 기본 true, BuildRequest 에 optional 노출**(base-path-aware 앱이 `false` 로 override). §6.
5. **status 실측 주기** — **결정: MVP 는 조회 시(on-demand) kubectl.** 주기 sync + 캐시는 후속(목록이 커지면).

> 역할 분리 요약: **runner = 배포(생성) + contextPath 보고**, **build-server = registry(SSOT) + 관리(scale/delete/status) kubectl + Ingress URL 조립**. 두 컴포넌트 모두 kubectl 을 쓰지만 책임이 다르다(생성 vs 수명).
