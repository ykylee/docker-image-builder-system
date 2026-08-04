# 호스팅 3티어 정책 설계안

## 1. 설계 결정

`hostingTier`는 사용자가 임의로 고르는 요금제 이름이 아니라, 서비스 규모와
자원 요청을 정책으로 평가한 **유효 운영 티어**다. 기존 `hostingScheme`은 URL
라우팅 축으로 유지하고 티어 판정과 분리한다.

기본 판정은 보수적으로 한다.

```text
effectiveTier = max(serviceSize, cpuRequest, memoryRequest, replicaRequest)
```

사용자가 더 높은 티어를 요청하는 것은 허용할 수 있지만, 낮은 티어를 요청하면서
그 티어의 자원 상한을 넘는 요청은 거부한다. 기존 요청처럼 관련 입력이 없으면
호환성을 위해 `sandbox` 기본값을 사용한다.

## 2. 도메인 모델

### 2.1 입력

BuildRequest에 다음 선택적 호스팅 입력을 추가한다. 기존 flat hosting 필드와의
호환성을 위해 초기에는 `hosting` 객체를 도입하지 않고 기존 필드 옆에 둔다.

```ts
type HostingSizingInput = {
  serviceSize?: "small" | "medium" | "large";
  requestedTier?: "sandbox" | "standard" | "production";
  resources?: {
    cpuRequest?: string;       // Kubernetes quantity, e.g. 250m
    memoryRequest?: string;    // Kubernetes quantity, e.g. 256Mi
    cpuLimit?: string;
    memoryLimit?: string;
    replicas?: number;
  };
};
```

`serviceSize`는 사용자의 규모 의도이고 `resources`는 실제 필요한 자원이다.
`requestedTier`는 최소 운영 수준을 높이는 요청이며 최종 결과를 강제로 낮출 수
있는 override가 아니다.

### 2.2 산출

서버가 다음을 계산해 BuildSummary와 HostedService에 반환·저장한다.

```ts
type HostingPolicyResult = {
  effectiveTier: "sandbox" | "standard" | "production";
  policyVersion: string;
  serviceSize: "small" | "medium" | "large";
  resources: {
    cpuRequest: string;
    memoryRequest: string;
    cpuLimit: string;
    memoryLimit: string;
    replicas: number;
  };
  source: "default" | "sizing" | "requested-tier";
};
```

`effectiveTier`와 `policyVersion`은 배포 당시 정책을 재현하기 위한 SSOT다.
현재 활성 정책이 바뀌어도 이미 배포된 서비스의 과거 판정 결과가 조용히 바뀌지
않아야 한다.

## 3. 정책 프로파일

초기 v1은 소형 shared cluster를 기준으로 다음 수치를 제안한다. 이는 서비스 한
개에 적용되는 기본값과 상한이며, 실제 클러스터 capacity 관측 후 조정한다.

CPU는 Kubernetes quantity(`m`), memory는 `Mi` 단위를 사용한다.

| 항목 | sandbox | standard | production |
| --- | ---: | ---: | ---: |
| 규모 rank | small | medium | large |
| CPU request 기본값 | 100m | 250m | 500m |
| Memory request 기본값 | 128Mi | 512Mi | 1Gi |
| CPU limit | 500m | 1 | 2 |
| Memory limit | 512Mi | 1Gi | 2Gi |
| replicas 기본값 | 1 | 1 | 2 |
| replicas 허용 범위 | 1 | 1~2 | 2~4 |
| 유휴 서비스 | 중지 허용 | 중지 선택 | 자동 중지 금지 |
| quota | 낮음 | 표준 | 높음/전용 quota |
| rollout | 기본 재배포 | rolling update | rolling update + rollback 기준 |
| 관측 | 기본 상태 | 상태·자원 경고 | SLO/자원/replica 강화 알림 |

### 3.1 판정 경계

자원 요청은 다음 경계로 티어를 판정한다.

| 조건 | 최소 판정 티어 |
| --- | --- |
| CPU request ≤ 250m, memory request ≤ 256Mi, replicas = 1 | sandbox |
| CPU request ≤ 1, memory request ≤ 1Gi, replicas ≤ 2 | standard |
| CPU request ≤ 2, memory request ≤ 2Gi, replicas 2~4 | production |
| 위 production 상한 초과 | 현재 정책에서 거부 |

여러 조건이 섞이면 가장 높은 티어를 적용한다. 예를 들어 CPU는 sandbox
범위지만 memory request가 512Mi이면 `standard`다. Production은 상용 보장을
의미하므로 replica 2 미만의 요청은 production으로 분류하지 않고 기본값 2로
보정한다.

정책 registry는 코드에 흩어 놓지 않고 versioned configuration 또는 단일
resolver가 소유한다. 각 프로파일은 `min`, `default`, `max`를 갖는다. `limit`는
request보다 작을 수 없고, request가 없는 기존 요청은 tier default를 사용한다.

## 4. 판정 및 검증 흐름

1. 입력 quantity와 replica를 문법·양수·최대 시스템 한도 기준으로 검증한다.
2. `serviceSize`와 각 자원 요구를 tier rank로 변환한다.
3. 가장 높은 rank를 최소 필요 티어로 계산한다.
4. `requestedTier`가 계산 결과보다 낮으면
   `HOSTING_TIER_UPGRADE_REQUIRED`를 반환한다.
5. 계산된 유효 티어의 max를 넘으면
   `HOSTING_RESOURCE_LIMIT_EXCEEDED`를 반환한다.
6. 누락된 자원은 유효 티어의 default로 채운다.
7. 결과와 policy version을 build 및 hosted service에 기록한다.
8. runner/Helm/ArgoCD adapter에는 계산된 resources와 replicas만 전달한다.

이렇게 하면 adapter가 티어 이름을 해석하지 않아도 되고, 모든 배포 방식이 같은
정책 결과를 사용한다.

## 5. 저장 모델과 API 영향

### 5.1 저장

`build_request`와 `hosted_service`에 다음 필드를 추가한다.

- `service_size` — small/medium/large
- `requested_tier` — nullable; 사용자가 요청한 최소 티어
- `effective_tier` — 서버가 확정한 티어
- `hosting_policy_version` — 판정에 사용한 정책 버전
- `resource_profile` — CPU/memory/replica의 JSONB snapshot

JSONB snapshot은 정책 변경 뒤에도 당시 배포 설정을 보존하기 위한 것이며,
운영 검색이 필요한 주요 필드는 별도 scalar column으로 둔다.

### 5.2 계약

- `BuildRequest`: sizing 입력 필드는 optional로 추가해 기존 소비자를 깨지 않는다.
- `BuildSummary`/`HostedService`: `effectiveTier`, `serviceSize`,
  `hostingPolicyVersion`, `resources`를 반환한다.
- Admin hosting 상세 화면은 요청 티어와 유효 티어를 구분해 표시한다.
- tier 판정 실패는 canonical error envelope과 위 error code를 사용한다.

## 6. 배포 adapter 연결

정책 resolver는 build-server가 한 번만 실행하고, 결과를 DeploymentReport 또는
claim 결과에 담아 runner로 전달한다.

- Helm: `resources.requests`, `resources.limits`, `replicaCount` values로 전달
- kubectl: Deployment spec의 resources/replicas에 반영
- ArgoCD: Application Helm parameters 또는 values에 동일 결과 전달
- namespace quota와 HPA는 resolver 결과와 함께 생성하되, Production 확장은
  별도 feature flag로 단계적으로 켠다.

adapter별로 tier 판정 로직을 복제하지 않는 것이 핵심이다.

## 7. 변경 및 lifecycle 규칙

- 새 서비스: 생성 시점에 policy snapshot을 확정한다.
- 재배포: 기본적으로 기존 effective tier를 유지한다. 새 요청이 더 높은 tier를
  요구하면 승급 후 재배포한다.
- 명시적 강등: admin 작업으로만 허용하고 자원·가용성 검증 후 재배포한다.
- 자동 강등: 초기 범위에서 제외한다.
- 정책 version 변경: 기존 서비스에 자동 적용하지 않고, 재배포/정책 reconcile
  시점에만 적용한다.
- `hostingScheme(path/subdomain)` 변경은 tier 변경과 독립적인 배포 변경이다.

## 8. 구현 순서

1. 클러스터 capacity/cost 조사 후 profile의 min/default/max 수치 확정
2. shared-contract enum·입력·출력 schema 추가
3. build-server policy resolver와 오류 코드 추가
4. migration 및 memory/postgres repository snapshot 저장
5. claim/report와 Helm/kubectl/ArgoCD 전달 경로 연결
6. admin API/UI에 유효 티어·자원·policy version 노출
7. 경계값/초과/승급/재배포 테스트와 통합 e2e 추가

## 9. 완료 기준

- 동일 입력이 memory/postgres와 Helm/kubectl/ArgoCD에서 동일한 tier result를 만든다.
- 누락 입력은 sandbox 기본값으로 기존 요청과 호환된다.
- 각 tier의 min/default/max 경계와 초과 요청이 테스트로 고정된다.
- 낮은 requestedTier로 높은 자원 요청을 우회할 수 없다.
- HostedService 조회에서 effective tier와 policy snapshot을 확인할 수 있다.
- 기존 `path`/`subdomain` 동작과 v0.9.0 배포 e2e가 회귀하지 않는다.

## 10. Capacity 검증 baseline

2026-08-04 로컬 `kind-dib` 단일 노드에서 다음을 관측했다.

- 노드 capacity/allocatable: **4 CPU / 8113108Ki(약 7.7Gi) memory**
- 시스템 pod requests: 약 **950m CPU / 360Mi memory**
- 개발 클러스터 보호 reserve: allocatable의 약 25%를 별도 확보
- 서비스에 사용할 보수적 budget: 약 **2 CPU / 5.5Gi memory**

이 budget을 v1 기본 request에 대입한 이론상 동시 서비스 수는 다음과 같다.

| 서비스만 배치 | CPU 기준 | Memory 기준 | 보수적 capacity |
| --- | ---: | ---: | ---: |
| sandbox (`100m/128Mi`) | 20 | 43 | **20** |
| standard (`250m/512Mi`) | 8 | 11 | **8** |
| production (`2 replicas × 500m/1Gi`) | 2 | 2 | **2** |

Namespace `ResourceQuota`는 단일 pod의 max가 아니라 허용 replica 전체의
aggregate를 사용한다. 따라서 standard quota는 `requests 2 CPU/2Gi`,
`limits 2 CPU/2Gi`, `pods 2`이고 production quota는 `requests/limits 8 CPU/8Gi`,
`pods 4`다. 서비스 pod 두 개가 모두 standard limit을 사용할 수 있어야 하므로
단일 pod quota로 정의하면 replica scale-out이 잘못 거부된다.

실제 운영 quota는 두 자원 중 작은 값에 namespace/Ingress/관측 sidecar 여유를
추가로 빼서 산정한다. 따라서 위 숫자는 사용자에게 보장하는 SLA가 아니라 개발
클러스터의 admission 상한 후보다.

초기 cluster admission 후보는 `sandbox 20`, `standard 8`, `production 2`개의 동시 활성
서비스이며, 혼합 배치에서는 tier별 가중치 합이 budget을 넘지 않도록 한다.
Production autoscaling은 이 baseline을 초과할 수 있으므로 HPA 도입 전에는
replica 상한 4를 admission에서 유지한다.
