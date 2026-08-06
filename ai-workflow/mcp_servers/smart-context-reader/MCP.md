# smart-context-reader

- 문서 목적: Python 파일 등에서 원하는 심볼(함수, 클래스)만 추출하여 읽기 전용으로 반환하는 MCP 도구의 스펙 정의
- 범위: 심볼 추출 알고리즘 및 MCP 인터페이스 스펙
- 대상 독자: AI 에이전트, MCP 클라이언트
- 상태: implemented
- 최종 수정일: 2026-05-02
- 관련 문서: `../../core/phase6_precision_editing_plan.md`

## 목적
LLM 에이전트가 대규모 코드를 분석하거나 수정할 때, 전체 파일을 컨텍스트에 넣는 대신 대상 클래스나 함수 블록만 선별적으로 제공하여:
1. LLM 컨텍스트 윈도우 낭비 방지
2. 관련 없는 코드에 의한 환각(Hallucination) 억제
3. 더 빠른 분석 시간 확보

## 입력 (Input)
- `file_path` (string, required): 읽어올 Python 대상 파일의 경로
- `symbols` (list of strings, optional): 추출할 함수명 또는 클래스명 목록. 비워두면 모든 함수/클래스를 반환한다.

## 출력 (Output)
- `extracted_content` (list of strings): 각 심볼별로 파싱된 코드 블록 문자열 리스트
- `not_found_symbols` (list of strings): 요청했지만 파일 내에서 찾을 수 없는 심볼 목록
- `warnings` (list of strings): 기타 파싱 중 경고 메시지

## 특이 사항
- 현재는 Python (`.py`) 파일의 `ast` 파싱만 공식 지원한다.
- SyntaxError가 있는 Python 파일의 경우 정상적인 AST 구성이 안 되므로 분석이 실패할 수 있다.
