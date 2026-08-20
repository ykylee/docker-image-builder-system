---
id: TASK-195
status: planned
created_at: 2026-08-20
source_anchor: generic-task-195
source_path: backlog/2026-08-20.md
kind: generic
---

# TASK-195 — proxy-artifact-factory-spike

## 📝 Description

- 상태: planned
- 우선순위: high
- 요청일: 2026-08-20
- 담당: codex
- 호스트명:
- 호스트 IP:
- 영향 문서:
  - `docs/operations/proxy-artifact-factory-2026-08-20.md`

- 작업 내용: Docker build 실패 후 local dependency materialization을 수행하고, artifact factory에 immutable bundle을 등록한 뒤 Docker가 외부 dependency 대신 artifact를 소비하는 fallback을 설계·검증한다. proxy profile/cache 직접 전달과 비교한다.
- 완료 기준: Docker 실패 → local dependency materialization → artifact 등록 → Docker 재시도 e2e와 credential 비노출·digest 무결성 검증을 수행하고 direct BuildKit cache 대 fallback factory 채택을 결정한다.

## 🛠️ Implementation / Content

- 진행 현황: 현재 BuildImage는 DOCKER_BUILDKIT=1만 설정하며 proxy/build cache 계약은 없다. Docker 실패 → local dependency 확보 → artifact 등록 → Docker 재시도 흐름과 manifest/integrity 계약을 설계 문서에 추가했다.
- 다음 세션 시작 포인트: 언어별 dependency bundle 형식과 `artifactId`/digest/lockfile manifest, fallback 가능 오류 분류를 정의한다.
- 남은 리스크: proxy credential 유출 및 mutable tag 공급망 위험이 있다.

## ✅ Outcome

- 작업 결과: 코드 점검에서 proxy 전달 경로 부재를 확인; live proxy 검증 미실행.
- 후속 작업: 채택 시 registry digest/provenance와 retention 정책을 구현한다.
