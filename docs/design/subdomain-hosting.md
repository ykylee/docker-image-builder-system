# 설계 검토 — subdomain 호스팅 스킴 (v0.5.0 후보)

- 문서 목적: Phase 3 의 path-prefix 호스팅에 **subdomain URL 스킴**을 대안으로 더하는 설계 검토.
- 대상 독자: 개발자, 리뷰어, AI 에이전트
- 상태: **구현 완료 (TASK-172, 2026-07-24) — 실 e2e(kind+ingress-nginx+nip.io) ALL PASS.**
- 최종 수정일: 2026-07-24
- 관련 문서: [Phase 3 컨셉](../PHASE-3-CONCEPT.md), [Phase 3 설계](../PHASE-3-DESIGN.md), [sub-path 규약](../operations/hosting-sub-path-2026-07-24.md)

## 1. 동기

Phase 3(v0.4.0)은 **path-prefix**(`host/<context-path>/`)로 호스팅한다. 그 본질적 제약(설계 §4): 앱이 **절대경로 자산**(`/main.js`)을 쓰면 context-path 밖으로 나가 깨진다. `APP_BASE_PATH` 규약을 따르는 앱만 1급 지원.

**subdomain**(`<context-path>.<host>`)은 이 제약을 **근본적으로 없앤다**: 앱이 자기 subdomain 의 **루트**에서 서빙되므로 절대경로 자산(`/main.js`)이 자연스럽게 동작한다. **앱 무수정 지원** — `APP_BASE_PATH`·rewrite·stripPrefix 불필요. 완전 격리가 필요한 앱(임의의 SPA/프레임워크)에 적합하다.

트레이드오프: **wildcard DNS + wildcard TLS** 가 필요하다(path-prefix 는 단일 host + 인증서로 충분).

## 2. 모델

| | path-prefix (기존) | subdomain (신규) |
|---|---|---|
| URL | `https://<host>/<cp>/` | `https://<cp>.<host>/` |
| Ingress | `path: /<cp>(...)` (+rewrite) | `host: <cp>.<host>`, `path: /` |
| 앱 요구사항 | `APP_BASE_PATH` 로 emit URL prefix | **없음**(루트 서빙) |
| DNS | 단일 host | **wildcard** `*.<host>` |
| TLS | 단일/host 인증서 | **wildcard** `*.<host>` |

`<cp>`(context-path)는 두 스킴 공통 식별자 — subdomain 에선 DNS label 로 쓰인다(기존 정규화가 이미 DNS-1123 정합).

## 3. 아키텍처 변경 (Phase 3 위에)

### 3.1 계약
- `BuildRequest.hostingScheme`: `"path" | "subdomain"` (기본 `"path"`). optional.
- `BuildSummary.hostingScheme`: claim 으로 runner 전파(contextPath/stripPrefix 와 동일 경로).
- `HostedService.hostingScheme` + url 이 스킴에 맞게 조립됨.

### 3.2 DB
- `build_request.hosting_scheme` + `hosted_service.hosting_scheme` (migration **0011**, default `'path'`).

### 3.3 runner (핵심 신규 배선)
- **runner 가 base host 를 알아야 한다** — subdomain Ingress 의 `host:` rule = `<cp>.<baseHost>`. 현재 runner 는 base host 미인지(server 만 URL 조립). 신규 env **`RUNNER_HOSTING_BASE_HOST`**(build-server 의 `HOSTING_BASE_HOST` 와 대칭) 도입.
- `renderK8sManifest` 가 scheme 분기:
  - `subdomain`: Ingress `host: <cp>.<baseHost>`, `path: /`(Prefix), **rewrite/APP_BASE_PATH 없음**.
  - `path`: 기존 그대로.

### 3.4 build-server
- url 조립 분기: subdomain → `https://<cp>.<HOSTING_BASE_HOST>/`. HostedService upsert 에 scheme 반영.
- 관리(K8sAdmin scale/delete)는 스킴 무관(자원 이름 동일).

## 4. DNS / TLS

- **prod wildcard DNS**: `*.<HOSTING_BASE_HOST>` → ingress. 운영자 책임(DNS 레코드).
- **prod wildcard TLS**: `*.<host>` 인증서. cert-manager(DNS-01) 또는 사전 프로비저닝. **TLS 자동화는 본 검토 범위 밖**(별도 후속) — 이번엔 스킴 라우팅까지.
- **dev / e2e**: **nip.io** magic DNS 로 wildcard 없이 실검증. `<cp>.127.0.0.1.nip.io` → 127.0.0.1. Ingress host rule 을 `<cp>.127.0.0.1.nip.io` 로 두고 `curl http://<cp>.127.0.0.1.nip.io:18080/`. 평문 HTTP.

## 5. e2e

기존 `e2e-hosting.sh` 에 subdomain phase 추가(또는 변형): 예제 앱을 `hostingScheme=subdomain` 으로 배포 → `curl http://demo.127.0.0.1.nip.io:18080/` → **절대경로 자산(`/app.js`) 정상 로드** 실측(APP_BASE_PATH 없이). path-prefix 와 대비되는 "앱 무수정" 을 실증.

## 6. 결정 (2026-07-24 확정)

1. ~~추가 vs 대체~~ — **병존**. path-prefix + subdomain 둘 다 지원, per-build 선택. Phase 3 유지 + 확장.
2. ~~스킴 선택 단위~~ — **per-build `hostingScheme` 필드**(path|subdomain, 기본 path).
3. ~~dev/e2e DNS~~ — **nip.io** magic DNS(`<cp>.127.0.0.1.nip.io`). 오프라인 CI 는 sslip.io/curl --resolve 대안 문서화.
4. ~~TLS 범위~~ — **후속**. 이번엔 스킴 라우팅(Ingress host rule) + dev 평문(nip.io)까지. wildcard TLS(cert-manager DNS-01)는 별도 마일스톤.

## 7. 규모 (구현 시)

path-prefix 대비 델타: 계약 1필드 + migration 0011 + runner base-host 배선 + manifest 분기 + server url 분기 + e2e subdomain phase. Phase 3 의 stripPrefix 패턴(TASK-169)과 거의 동형 — 중간 규모 1 마일스톤.
