---
id: TASK-180
status: done
created_at: 2026-08-16
source_anchor: generic-task-180
source_path: backlog/2026-08-16.md
kind: generic
---

# TASK-180 — queue-lease-recovery

## 📝 Description

- 상태: done
- 우선순위: high
- 요청일: 2026-08-16
- 담당:
- 호스트명:
- 호스트 IP:
- 영향 문서:
-

- 작업 내용: Queue lease 만료 감지 및 stale build 재큐잉
- 완료 기준:

## 🛠️ Implementation / Content

- 진행 현황: Postgres 실제 roundtrip 완료. BUILD_LEASE_TIMEOUT_MS=1000ms로 Build Server를 기동해 build 생성→source 업로드→첫 claim→대기→두 번째 Runner claim 재성공을 확인했고 phaseHistory/recovery log도 확인.
- 다음 세션 시작 포인트: TASK-181 service DB lifecycle/recovery 진행
- 남은 리스크:

## ✅ Outcome

- 작업 결과: stale in-flight build가 다음 claim cycle에서 QUEUED로 복구되어 재처리되며, terminal build에는 적용하지 않는 lease recovery가 memory/Postgres 양쪽에 연결됨.
- 검증 결과: pnpm check PASS; Build Server full tests 252/252 PASS; Postgres migration bootstrap PASS; Postgres stale recovery smoke PASS (첫 claim 후 2초 뒤 다른 runner가 동일 build 재 claim); git diff --check PASS
- 후속 작업:
