---
id: TASK-179
status: planned
created_at: 2026-08-16
source_anchor: generic-task-179
source_path: backlog/2026-08-16.md
kind: generic
---

# TASK-179 — runner-auth-isolation

## 📝 Description

- 상태: planned
- 우선순위: critical
- 요청일: 2026-08-16
- 담당: codex
- 호스트명:
- 호스트 IP:
- 영향 문서:
-

- 작업 내용: Runner registration/claim/phase/container-test/deployment 보고를 per-runner credential과 최소 권한으로 보호하고 비신뢰 build 실행 경계를 분리한다.
- 완료 기준: credential 없는 Runner API 호출은 401/403이다.
- 완료 기준: 다른 Runner가 claim한 build의 phase를 변경할 수 없다.
- 완료 기준: Runner별 K8s RBAC와 credential rotation이 검증된다.
- 완료 기준: host Docker socket 직접 공유가 제거되거나 격리 worker로 대체된다.

## 🛠️ Implementation / Content

- 진행 현황: 현재 runner control API는 AUTH_SECRET 미설정 환경에서 무인증이며 Docker socket/kubeconfig를 공유한다.
- 다음 세션 시작 포인트: per-runner token과 claim lease를 먼저 계약에 추가한다.
- 남은 리스크: BuildKit/rootless 또는 전용 worker 도입 범위가 크다.

## ✅ Outcome

- 작업 결과:
- 후속 작업:
