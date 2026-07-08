<!-- standard-ai-workflow-kit: v0.11.25-beta -->

# /workflow-doc-sync

> Claude Code slash command. 표준 AI 워크플로우 의 *doc-sync* 진입점.

## 역할

작업 후 영향 받은 문서 후보를 식별하고 `ai-workflow/memory/active/` 의 허브 /
index 갱신 포인트를 정리.

## 절차

1. 현재 변경된 file list + 영향 받은 document 후보 식별
2. `ai-workflow/wiki/index.md` anchor 기반 페이지 카탈로그 확인
3. 영향 받은 페이지에 대해 *advisory* 갱신 포인트 emit:
   - 새 concept / decision / pattern 페이지 후보
   - 기존 페이지의 `last_touched` 갱신 후보
4. PURPOSE.md 부재 시 *advisory only* (hard scope check ❌)

## 출력 형식

- 영향 받은 document list (path + 1줄 요약)
- 권장 anchor / cross-reference
- confidence (high / medium / low)

## 다음에 읽을 문서

- `ai-workflow/wiki/index.md`
- (있으면) `ai-workflow/memory/active/PURPOSE.md`

## language 원칙

- 갱신 포인트 보고 = 한국어
- file path, anchor, 설정 key = 원문
