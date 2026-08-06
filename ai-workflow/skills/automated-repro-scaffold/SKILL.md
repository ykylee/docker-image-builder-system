# Skill: automated-repro-scaffold

- 문서 목적: 버그 재현용 독립 샌드박스 스크립트 자동 생성 스킬의 사용법과 기능을 설명한다.
- 범위: 스킬 실행 방법, 주요 기능, 프로토타입 실행 예시
- 대상 독자: AI 에이전트, 개발자
- **상태: stable** (v0.11.24 — Pydantic BaseOutput 정합 + 4 error_code + 단일 진입점 + smoke test)
- 최종 수정일: 2026-07-03
- 관련 문서: `core/automated_repro_scaffold_skill_spec.md`, `core/workflow_skill_catalog.md`, `workflow_kit/common/schemas/automated_repro_scaffold.py`

## 실행 방법 (Stable)

```bash
python3 workflow-source/skills/automated-repro-scaffold/scripts/run_automated_repro_scaffold.py \
  --report "bug_report.md" \
  --output "tests/repro_issue_1.py"
```

`--dry-run` 옵션: script 를 write 하지 않고 plan + template preview 만 출력.
`--json` 옵션: status/error_code envelope 강제 출력.

## 주요 기능
- **이슈 분석**: 텍스트 기반 버그 리포트에서 재현 핵심 로직 추출.
- **코드 스캐폴딩**: `unittest` 기반의 독립 실행형 테스트 코드 생성.
- **의존성 주입**: 필요한 경우 가짜 데이터(Mock)나 최소한의 환경 설정 포함.
- **StageCompletion 통합** (v0.6.5+): `next_stage="validation-plan"` 자동 emit, downstream 워크플로우 연결.

## 입력 계약 (Input Contract)

```json
{
  "report": "bug_report.md",   // required — 입력 버그 리포트 경로
  "output": "tests/repro_X.py" // required — 생성된 scaffold 저장 경로
}
```

## 출력 계약 (Output Contract) — v0.11.24 Pydantic 정합

```json
{
  "status": "ok|warning|error",
  "tool_version": "v0.11.24-beta",
  "warnings": ["..."],
  "repro_script_path": "tests/repro_X.py",
  "repro_script_lines": 42,
  "execution_command": "python3 tests/repro_X.py",
  "next_stage": "validation-plan",
  "source_context": {
    "report_path": "bug_report.md",
    "output_path": "tests/repro_X.py"
  }
}
```

## Error codes (4종, v0.11.24 stable 정합)

| Error code | 발생 시점 | 비고 |
|---|---|---|
| `automated_repro_scaffold_report_file_not_found` | `--report` 경로 부재 | 사전 차단 |
| `automated_repro_scaffold_output_dir_unwritable` | `--output` 디렉토리/파일 쓰기 실패 | OSError catch |
| `automated_repro_scaffold_template_render_failed` | 내부 template format 실패 | KeyError/ValueError catch |
| `automated_repro_scaffold_runtime_error` | catch-all OSError (report read 등) | 기타 runtime |

## 예시 실행 (v0.11.24 stable)

### 예시 1 — 정상 케이스

```bash
$ echo "Test bug: foo returns None instead of 42" > /tmp/bug.md
$ python3 workflow-source/skills/automated-repro-scaffold/scripts/run_automated_repro_scaffold.py \
    --report /tmp/bug.md \
    --output /tmp/repro_bug.py

{
  "status": "ok",
  "tool_version": "v0.11.24-beta",
  "warnings": ["이것은 자동 생성된 scaffold 입니다. 실제 reproduce logic 은 후속 작성 필요."],
  "repro_script_path": "/tmp/repro_bug.py",
  "repro_script_lines": 36,
  "execution_command": "python3 /tmp/repro_bug.py",
  "next_stage": "validation-plan",
  "source_context": { "report_path": "/tmp/bug.md", "output_path": "/tmp/repro_bug.py" },
  "stage_completion": { "stage_name": "automated-repro-scaffold", "stage_status": "ok", ... }
}
```

### 예시 2 — report 부재 (error_code: automated_repro_scaffold_report_file_not_found)

```bash
$ python3 workflow-source/skills/automated-repro-scaffold/scripts/run_automated_repro_scaffold.py \
    --report /tmp/missing.md \
    --output /tmp/repro_bug.py

{
  "status": "error",
  "tool_version": "v0.11.24-beta",
  "error": "리포트 파일을 찾을 수 없다: /tmp/missing.md",
  "error_code": "automated_repro_scaffold_report_file_not_found",
  "warnings": ["report file not found: /tmp/missing.md"],
  "source_context": { "report_path": "/tmp/missing.md", "output_path": "/tmp/repro_bug.py" },
  "stage_completion": { "stage_name": "automated-repro-scaffold", "stage_status": "error", ... }
}
```

### 예시 3 — dry-run (script write 안 함)

```bash
$ python3 workflow-source/skills/automated-repro-scaffold/scripts/run_automated_repro_scaffold.py \
    --report /tmp/bug.md \
    --output /tmp/repro_bug.py \
    --dry-run

{
  "mode": "dry-run",
  "would_write_to": "/tmp/repro_bug.py",
  "preview_first_500": "#!/usr/bin/env python3\nimport unittest\n..."
}
```

## 판단 기준 (Checklist)

- [x] 스크립트가 다른 파일에 의존하지 않고 독립적으로 실행 가능한가? (unittest stdlib 만 사용)
- [x] 버그 리포트의 에러 상황을 `assert` 또는 예외 발생으로 재현하는가? (scaffold 단계에서는 placeholder; 후속 작성)
- [x] 실행 명령어가 명확히 제공되는가? (`execution_command` 필드)
- [x] Pydantic v2 schema (AutomatedReproScaffoldOutput) 정합? ✅ (v0.11.24)
- [x] error_code 4종 정의? ✅ (v0.11.24)
- [x] smoke test PASS? ✅ (tests/check_automated_repro_scaffold.py)

## 후속 (downstream)

생성된 repro script 는 `validation-plan` 단계로 자동 연결 (StageCompletion 의 `next_stage`). 본 skill 단독 실행 시 `execution_command` 의 python3 호출로 reproduce logic 을 후속 작성자가 채워야 함.