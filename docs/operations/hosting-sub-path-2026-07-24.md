# 호스팅 sub-path 규약과 제약 (P3-M4, 2026-07-24)

- 문서 목적: path-prefix 호스팅(`host/<context-path>/`)에서 앱이 올바르게 동작하기 위한 **규약(`APP_BASE_PATH`)과 제약**을 명시한다.
- 대상 독자: 앱 개발자(호스팅 대상), 운영자, AI 에이전트
- 상태: stable (TASK-169 봉인)
- 최종 수정일: 2026-07-24
- 관련 문서: [Phase 3 설계 §6](../PHASE-3-DESIGN.md), [k8s 배포/webhook](./k8s-deploy-webhook-2026-07-24.md)

## 1. 핵심 규약 — `APP_BASE_PATH`

호스팅 시스템은 각 앱을 `https://<HOSTING_BASE_HOST>/<context-path>/` 하위에 서빙한다. 앱 컨테이너에는 **`APP_BASE_PATH=/<context-path>/` env 가 주입**된다.

**앱의 책임**: 브라우저에 emit 하는 **자산/링크 URL 에 `APP_BASE_PATH` prefix 를 붙인다.**

```html
<!-- ❌ 절대 루트 — context-path 하위에서 깨진다 -->
<script src="/app.js"></script>
<!-- ✅ APP_BASE_PATH prefix -->
<script src="/todo-app/app.js"></script>
```

프레임워크는 대개 빌드/런타임 base 설정을 제공한다: Vite `base`, CRA `homepage`, Next.js `basePath`, Angular `--base-href`. 이 값을 `APP_BASE_PATH` 로 지정하면 된다. 최소 예제: [`examples/hosted-base-path-app`](../../examples/hosted-base-path-app).

## 2. 두 가지 모드 — `stripPrefix`

빌드 요청의 `stripPrefix`(기본 `true`)가 Ingress 라우팅 방식을 정한다.

### stripPrefix = true (기본)
- Ingress 가 `rewrite-target` 으로 context-path prefix 를 **벗겨** 앱 서버는 **루트 기준**(`/app.js`) 요청을 받는다.
- 앱은 **서버 라우팅은 그대로(루트)** 두고, **emit URL 에만** `APP_BASE_PATH` prefix 를 붙이면 된다.
- 대부분의 정적 서버/SPA 에 적합(서버가 mount 위치를 몰라도 됨).

### stripPrefix = false (pass-through)
- Ingress 가 prefix 를 벗기지 않고 `/<context-path>/...` 를 **그대로** 앱에 넘긴다.
- 앱 서버가 **자기 base path 를 알고** `/<context-path>/...` 를 직접 서빙해야 한다(예: Next.js `basePath`, 서버 라우터에 prefix 설정).
- fully base-path-aware 앱에 적합.

## 3. ⚠️ 제약 (1급 지원 범위)

- **1급 지원**: `APP_BASE_PATH` 규약을 따르는 앱(emit URL 에 prefix) 또는 base-path-aware 서버(`stripPrefix=false`).
- **지원 안 됨**: 자산 경로를 **절대 루트로 하드코딩**(`/main.js`)하고 `APP_BASE_PATH` 도 base 설정도 없는 앱. 이 경우 브라우저가 context-path 밖(`host/main.js`)을 요청해 404 가 난다. path-prefix 호스팅의 본질적 한계다.
- 완전 격리(앱 수정 없이)가 필요하면 **subdomain 스킴**(`<app>.host`, `BuildRequest.hostingScheme="subdomain"`, TASK-172)을 쓴다 — 앱이 자기 subdomain 루트에서 서빙돼 절대경로 자산이 자연 동작(무수정). wildcard DNS/TLS 필요(dev/e2e 는 nip.io). [설계](../design/subdomain-hosting.md) 참조.
- `<base href="/<cp>/">` 주입(HTML 상대경로 앱 구제)은 best-effort 옵션으로 후속 검토(절대경로/JS fetch 는 못 구제).

## 4. 빌드 요청 필드 (호스팅)

`POST /builds` (BuildRequest):

| 필드 | 기본 | 의미 |
|---|---|---|
| `contextPath` | appName 정규화 | URL prefix. 전역 유일(예약어 회피). |
| `runtimePort` | 8080 | 앱 컨테이너 listen 포트. |
| `stripPrefix` | true | §2 참조. base-path-aware 서버는 false. |

## 5. 검증

`examples/hosted-base-path-app` 를 빌드→호스팅하면 `host/<context-path>/` 에서 페이지 + `app.js` 자산이 정상 로드되고 "hosted OK — APP_BASE_PATH=/<cp>/" 가 표시된다. 실 kind + ingress-nginx e2e 는 P3-M5.
