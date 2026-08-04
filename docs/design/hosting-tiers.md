# 호스팅 3티어 정책 컨셉

## 1. 목적

호스팅 티어는 URL 방식이나 특정 배포 도구를 구분하는 기능 플래그가 아니다.
서비스의 규모와 할당 자원을 기준으로 호스팅 운영 수준을 선택하는 **자원·운영
프로파일**이다.

이 문서는 티어 정책의 개념과 판정 원칙을 고정한다. CPU·메모리·replica의 실제
수치는 클러스터 capacity, 비용 모델, 관측 결과를 확인한 뒤 별도 정책 개정으로
정한다.

## 2. 정책 모델

```text
서비스 규모 + 자원 요청
        ↓
호스팅 티어 판정
        ↓
티어 프로파일 적용
  ├─ CPU / memory request·limit
  ├─ replica 및 가용성
  ├─ namespace / quota
  ├─ lifecycle 및 eviction
  └─ 관측·알림 수준

hostingScheme(path/subdomain)은 별도 축
```

`hostingTier`는 서비스가 요구하는 최소 운영 수준을 나타내고,
`hostingScheme`은 트래픽 라우팅 방식을 나타낸다. 따라서 subdomain을 사용한다고
자동으로 Production 티어가 되거나, Sandbox가 반드시 path만 사용해야 하는 것은
아니다.

## 3. 기본 티어 프로파일

| 티어 | 서비스 규모 | 기본 운영 성격 | 기본 프로파일 방향 |
| --- | --- | --- | --- |
| `sandbox` | 소형·개발·검증 서비스 | 비용 최소화, 실패 격리 | 최소 request/limit, 단일 replica, 유휴 중지 가능 |
| `standard` | 일반 운영 서비스 | 예측 가능한 성능과 운영 편의 | 표준 request/limit, 단일 또는 이중 replica, 기본 상태 관측 |
| `production` | 대형·핵심 서비스 | 가용성과 확장 우선 | 높은 resource quota, 다중 replica, rolling update·autoscaling·강화된 관측 |

위 표의 “가능” 또는 “방향”은 구현 완료를 의미하지 않는다. 현재 시스템은
호스팅 scheme과 기본 lifecycle 관리까지 제공하며, tier별 quota·autoscaling·TLS는
후속 구현 범위다.

## 4. 판정 원칙

1. 서비스가 선언한 CPU, memory, replica, storage 및 가용성 요구를 입력으로 받는다.
2. 요청 자원이 속하는 가장 낮은 티어를 기본 티어로 판정한다.
3. 사용자가 더 높은 티어를 명시하면 허용할 수 있지만, 그 티어의 상한을 넘는
   요청은 거부한다.
4. 낮은 티어를 명시했더라도 자원 요청이 해당 티어의 상한을 넘으면 자동 수용하지
   않는다. `tier_upgrade_required`와 같은 명확한 오류 또는 승급 권고를 반환한다.
5. 초기 버전에서는 실사용량만으로 자동 강등하지 않는다. 초과 사용은 관측·알림과
   승급 권고의 근거로 사용한다.
6. 티어 변경은 기존 호스팅 서비스의 배포 설정 변경으로 취급하며, 적용 시점과
   현재 유효 티어를 기록한다.

## 5. 자원 수치 확정 전의 경계

설계안의 v1 제안값은 소형 shared cluster를 대상으로 한 초기 baseline이며,
Production SLA 또는 실제 비용 약속으로 해석하지 않는다. 특히 production의
autoscaling, 전용 quota, TLS는 수치와 별도로 후속 검증이 필요하다.

다음 값은 클러스터 용량과 비용 기준을 확인하기 전까지 확정하지 않는다.

- 각 티어의 CPU/memory request·limit
- 허용 replica 범위
- namespace별 quota와 서비스별 최대 수
- 유휴 중지 시간과 보존 기간
- Production의 autoscaling 기준 및 최소 replica
- TLS, 백업, 복구 목표와 같은 부가 운영 보장

따라서 현재 단계의 계약은 `sandbox | standard | production`이라는 분류 체계와
판정 원칙까지이며, 숫자와 SLA는 다음 정책 개정에서 확정한다.

## 6. 후속 설계 순서

1. 클러스터 capacity와 비용 기준을 수집한다.
2. 티어별 자원 matrix와 quota를 수치화한다.
3. `hostingTier` 입력·산출·저장 위치를 정한다.
4. tier policy resolver를 설계한다.
5. Helm/k8s adapter, admin API/UI, 상태 관측에 정책을 연결한다.
6. 경계값·초과 요청·승급·재배포 lifecycle을 e2e로 검증한다.
