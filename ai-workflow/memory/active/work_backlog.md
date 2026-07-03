<!-- standard-ai-workflow-kit: v0.11.21-beta -->

# 작업 백로그 인덱스

- 문서 목적: 프로젝트의 모든 작업 항목과 날짜별 백로그 링크를 관리한다.
- 범위: 전체 태스크 목록, 우선순위, 진행 상태, 날짜별 기록 연결
- 대상 독자: 개발자, AI 에이전트, 프로젝트 매니저
- 상태: stable
- 최종 수정일: 2026-07-03 (rev 21: PR #6 (Svelte 5 frontend 부착 1차 골격) — TASK-039, 회귀 273/273 OK)
- 관련 문서: [세션 인계](./session_handoff.md), [프로젝트 프로파일](../../docs/PROJECT_PROFILE.md)

## 1. 운영 원칙
1. 세션 시작 시 인덱스와 최신 백로그 확인
2. **세션 종료 직전(commit 직전) 인덱스 및 Handoff 갱신** — [`../core/global_workflow_standard.md` §8](../core/global_workflow_standard.md) 정합 — `memory 갱신 → commit → push` 순서
3. 모든 작업 상태는 날짜별 백로그에 기록

## 2. 날짜별 백로그
- [2026-07-03](./backlog/2026-07-03.md)
- [2026-07-02](./backlog/2026-07-02.md)

## 3. 전체 작업 상태 요약
- [x] TASK-001: 컨셉 기반 온보딩 및 MVP 작업축 정리
- [x] TASK-002: 컨셉 고도화 및 정책 문서 정리
- [x] TASK-003: 요구사항 도출 및 정제
- [x] TASK-004: Step 04 설계 문서 구조화
- [x] TASK-005: Step 05 진입 기준 및 baseline decision 정리
- [x] TASK-006: Step 06 구현 축 및 workstream 정리
- [x] TASK-007: Step 07 구현 backlog baseline 정리
- [x] TASK-008: PKG-001 공통 계약 기준선 정리
- [x] TASK-009: Build Server 기술 스택 baseline 정리
- [x] TASK-010: 저장소 패키지 구조 초안 정리
- [x] TASK-011: `PKG-002` Build Server request intake 세부 태스크 정리
- [x] TASK-012: `PKG-003` persistence 세부 태스크 정리 또는 코드 스캐폴드 진입 판단
- [x] TASK-013: shared package 코드 스캐폴드 또는 `PKG-004` 조회 계층 세분화 판단
- [x] TASK-014: shared package 또는 API 스캐폴드 진입 판단
- [x] TASK-015: SDLC 리뷰 및 보고 패키지 작성
- [x] TASK-016: 문서 정합성 보정 및 스캐폴드 진입 준비
- [x] TASK-022: workflow 메타 정합성 보강 (commands placeholder, status assessment, report 인덱스, legacy 배너, 2026-07-02 백로그 봉인)
- [x] TASK-023: 워크플로우 skill/MCP 셋업 (워크플로우 온보딩 마무리)
- [x] TASK-024: 리뷰 반영 (08 Build Server=TS / Runner=Go baseline 정합, 09 apps/runner Go 예시·의존방향·PKG-005~007 갱신)
- [x] TASK-033: preview-readiness-checker skill 1종 구현 (Python, 42 tests OK, total 215)
- [x] TASK-034: PKG-005 Runner Claim And Build Phase Skeleton 1차 골격 구현 (claim/phase endpoint 2종 + memory/postgres repo, live smoke 7/7; 누적 회귀 TS 37 + Go 13 + Python 215 = 265/265 OK)
- [x] TASK-035: Go Runner claim loop + phase call (HTTPBuildControlClient + BuildService 4-phase 자동 보고 + Worker loop, 6 phase e2e smoke + Go 10 tests; 누적 회귀 265/265 OK)
- [x] TASK-036: PKG-006 Preview Service Queue And Readiness (4 endpoint + Runner queue/ready 자동 보고, 8 phase e2e smoke + TS 14 + Go 3 신규 tests)
- [x] TASK-032: failure-summary MCP 1종 구현 (Python, 16 tests OK, total 173)
- [x] TASK-031: failure-summary-shaper skill 1종 구현 (Python, 25 tests OK, total 157)
- [x] TASK-030: contract-drift-checker skill 1종 구현 (Python, 25 tests OK, total 132)
- [x] TASK-029: build-log-tail MCP 1종 구현 (Python, 50 tests OK)
- [x] TASK-028: latest-build-status MCP 1종 구현 (Python, 21 tests OK)
- [x] TASK-027: build-status-explainer skill 2종 구현 (Python, 22 tests OK)
- [x] TASK-026: build-request-intake skill 1종 구현 (Python, 14 tests OK)
- [x] TASK-025: 우리 시스템 skill/MCP 후보 정리 및 개발 계획 (docs/sdlc/13)
- [x] TASK-017: shared package / build-server / runner 골격 스캐폴드 및 1차 검증
- [x] TASK-018: 보고자료 재구성 및 기획안 재작성
- [x] TASK-019: 리더 소개용 HTML 보고자료 시각화 재작성
- [x] TASK-020: HTML 시각화 보강 및 오프라인 에셋 내장화
- [x] TASK-021: 발표용 카피 압축 및 승인안 톤 보정
- [x] TASK-022: 백엔드 착수용 기술스택 결정 보정
- [x] TASK-023: 백엔드 개발 계획 수립 및 문서화
- [x] TASK-038: Build Server OpenAPI/Swagger UI + CORS + DESIGN.md 1차안 부착 (PR #5). Fastify 플러그인 3종 (swagger, swagger-ui, @asteasolutions/zod-to-openapi 8.5) 부착, 16 zod schema 의 .meta({ id, description }) 통일, hand-rolled CORS (onRequest + OPTIONS wildcard, @fastify/cors 제외 — ESM/fastify-plugin fp 호환성 문제), CORS_ORIGIN ENV 추가, /openapi.json 10 paths / 17 components.schemas / 4 tags, /docs Swagger UI, docs/DESIGN.md (Stitch v1 spec) 1차안, openapi snapshot test 1종. 회귀 266/266 OK (TS 38 + Go 13 + Python 215).
- [x] TASK-039: Build Monitor frontend 부착 1차 골격 (PR #6). Svelte 5 + Vite + TypeScript 선정 (DESIGN.md §0 Stack), apps/build-monitor 골격 + DESIGN.md tokens.css CSS 변수화 + 4 컴포넌트 (StatusPill/BuildRow/PhaseTimeline/LogStream) + Header + 3 route + lib/api.ts hand-typed 1차 + Vite proxy /api → :3000 + vitest 7/7 (StatusPill 매핑) + svelte-check 0 + vite build OK (gzip 22KB). 회귀 273/273 OK (TS 38+7 + Go 13 + Python 215). openapi-typescript 자동 client / list endpoint / light mode 는 후속 PR.
