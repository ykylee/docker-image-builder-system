# 운영과 검증

## 기본 명령

실행·설치·빠른 테스트의 현재 기준은 [PROJECT_PROFILE §3](../../docs/PROJECT_PROFILE.md)과 `ai-workflow/memory/active/state.json`의 `commands`를 사용합니다.

## 검증 기준선

2026-08-05 기준 Build Server `243/243`, React `289/289`, Runner `go test ./...`, TypeScript checks, main `/health`·`/docs`·`/api/services` smoke가 통과했습니다.

## 운영 문서

- [현재 구현 현황 및 실사용 준비도](../../docs/operations/current-state-and-readiness-2026-08-05.md)
- [Release Checklist](../../docs/operations/release-checklist-2026-07-20.md)
- [Container Self-dogfood](../../docs/operations/container-self-dogfood.md)
- [Hosting E2E CI](../../docs/operations/hosting-e2e-ci-2026-07-27.md)
- [Smoke and Migration](../../docs/operations/smoke-and-migration.md)
- [Production Semantic Postgres](../../docs/operations/production-semantic-postgres-2026-07-20.md)
