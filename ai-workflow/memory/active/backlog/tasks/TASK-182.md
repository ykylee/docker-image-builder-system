---
id: TASK-182
status: planned
created_at: 2026-08-16
source_anchor: generic-task-182
source_path: backlog/2026-08-16.md
kind: generic
---

# TASK-182 — runtime-hardening-observability

## 📝 Description

- 상태: planned
- 우선순위: medium
- 요청일: 2026-08-16
- 담당: codex
- 호스트명:
- 호스트 IP:
- 영향 문서:
-

- 작업 내용: 운영 배포 기본값, CORS/네트워크, Compose portability, cleanup/metrics/감사 로그를 실서비스 기준으로 정리한다.
- 완료 기준: 운영 CORS allow-list와 private network 경계가 강제된다.
- 완료 기준: Compose profile/필수 env 문서와 실제 동작이 일치한다.
- 완료 기준: source/workspace/image retention과 dry-run이 제공된다.
- 완료 기준: request/build/runner/service correlation log와 운영 metrics가 제공된다.

## 🛠️ Implementation / Content

- 진행 현황: CORS wildcard, host port publish, Docker socket self-dogfood 기본값, hardcoded local hosting host, artifact cleanup 부재가 확인됐다.
- 다음 세션 시작 포인트: 운영용 compose/k8s overlay를 별도 분리하고 기본값을 검토한다.
- 남은 리스크: self-dogfood 편의 기본값과 production secure default의 분리가 필요하다.

## ✅ Outcome

- 작업 결과:
- 후속 작업:
