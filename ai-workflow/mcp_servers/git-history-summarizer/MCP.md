# MCP: git-history-summarizer

- 문서 목적: Git 커밋 이력을 분석하여 세션 작업 내역을 요약한다.
- 범위: 최근 커밋 로그 파싱, 작업 카테고리 분류, MD 형식의 요약 생성
- 대상 독자: AI 에이전트, 개발자
- 상태: prototype
- 최종 수정일: 2026-04-27
- 관련 문서: `../../ai-workflow/memory/active/sessions`, `../../core/workflow_mcp_candidate_catalog.md`

## 1. 개요

`git-history-summarizer`는 Git 커밋 메시지를 분석하여 현재 세션에서 수행된 작업을 자동으로 요약해주는 MCP 도구입니다. 이는 `session_handoff.md`의 "완료된 작업" 섹션을 작성할 때 에이전트의 판단을 보완하고 데이터 기반의 정확한 기록을 가능하게 합니다.

## 2. 입력 (Input)

- `range`: (string) 요약할 커밋 범위 (예: `HEAD~5..HEAD`, `main..feature-branch`). 기본값: `HEAD~3..HEAD`.
- `format`: (string) 출력 형식 (`markdown` | `json`). 기본값: `markdown`.
- `repo_path`: (string) 대상 저장소 경로. 기본값: `.` (현재 디렉토리).

## 3. 출력 (Output)

- `summary`: (string) 카테고리별로 분류된 작업 요약 MD.
- `commit_count`: (int) 분석된 총 커밋 수.
- `categories`: (dict) 각 카테고리별 커밋 수.
- `raw_log`: (list) 분석에 사용된 원본 커밋 리스트.

## 4. 실행 예시

```bash
python3 workflow-source/mcp_servers/git-history-summarizer/scripts/run_git_history_summarizer.py --range "HEAD~5..HEAD"
```

## 5. 구현 로직

1. `git log --pretty=format:"%s|%h|%an|%ad" --date=iso <range>` 명령 실행.
2. 각 커밋 메시지를 키워드 기반으로 분류:
    - `feat`, `add`: 기능 추가 (Feature)
    - `fix`, `bug`: 버그 수정 (Bug Fix)
    - `docs`: 문서 (Docs)
    - `refactor`, `clean`: 리팩토링 (Refactor)
    - `test`: 테스트 (Test)
    - `chore`, `config`: 기타 (Chore)
3. 분류된 정보를 바탕으로 MD 요약 생성.
