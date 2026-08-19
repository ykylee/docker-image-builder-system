---
id: TASK-189
status: done
created_at: 2026-08-18
source_anchor: generic-task-189
source_path: backlog/2026-08-18.md
kind: generic
---

# TASK-189 — disabled-deployment-registration-id-contract

## 📝 Description

- 상태: done
- 우선순위: high
- 요청일: 2026-08-18
- 담당: yklee
- 호스트명:
- 호스트 IP:
- 영향 문서:
  - `compose.dev.yaml`
  - `examples/k8s-control-plane.yaml`
  - `docs/PROJECT_PROFILE.md`

- 작업 내용: 정책이 명시된 내부 배포 manifest/compose에 AUTH_MODE=disabled와 X-User-Id 등록 ID scope 전달 계약을 반영한다.
- 완료 기준: Compose 기본 배포가 AUTH_MODE=disabled를 사용한다.
- 완료 기준: Kubernetes control-plane 예시가 AUTH_MODE=disabled를 명시하고 X-User-Id scope 계약을 설명한다.
- 완료 기준: 운영 문서가 공개 모드의 등록 ID 격리와 신뢰 네트워크 제한을 설명한다.

## 🛠️ Implementation / Content

- 진행 현황: `2026-08-18 12:06` 기준 정책이 명시된 내부 배포 manifest/compose에 AUTH_MODE=disabled와 X-User-Id 등록 ID scope 전달 계약을 반영한다.
- 다음 세션 시작 포인트: 완료 — 외부 노출 전 required/oidc 전환 검토.
- 남은 리스크: X-User-Id는 인증 토큰이 아니므로 AUTH_MODE=disabled 배포는 신뢰된 내부 네트워크 전용이다.

## ✅ Outcome

- 작업 결과: 소스 재빌드 후 실제 HTTP smoke에서 X-User-Id=alice/bob 각각 자신의 build만 조회함을 확인했다.
- 작업 결과: 두 등록 ID의 GET /services 응답이 서로 격리됨을 확인했다.
- 검증 결과: AUTH_MODE=disabled PORT=3311 memory 서버: GET /health 200, POST /builds 202×2, GET /builds 200×2 및 owner isolation PASS, GET /services 200×2 scope isolation PASS.
- 후속 작업:
