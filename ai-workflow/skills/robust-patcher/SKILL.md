# Skill: robust-patcher

- 문서 목적: 로컬 LLM의 낮은 편집 정밀도를 보완하기 위해 Search-Replace 블록 기반의 퍼지 패치 기능을 제공한다.
- 범위: SEARCH/REPLACE 블록 파싱, 퍼지 매칭, 문법 검사
- 대상 독자: AI 에이전트, 개발자
- 상태: stable (v0.11.21 stable 승격)
- 최종 수정일: 2026-07-01
- 관련 문서: `core/phase6_precision_editing_plan.md`

## 1. 개요
줄 번호나 정확한 공백 일치가 어려운 로컬 LLM 환경에서, 수정하고 싶은 코드의 **원래 모습(SEARCH)**과 **수정된 모습(REPLACE)**만 제공하면 지능적으로 위치를 찾아 수정합니다.

## 2. 사용 방법 (LLM 지침)
코드를 수정할 때 아래 형식을 사용하십시오.

```
<<<<<<< SEARCH
[수정하고 싶은 기존 코드 블록]
=======
[새롭게 변경될 코드 블록]
>>>>>>> REPLACE
```

## 3. 예시 실행 (v0.11.21 stable 정합)

```bash
# 1) 패치 적용 (정확 매칭)
python3 skills/robust-patcher/scripts/run_robust_patcher.py \
  --file "src/main.py" \
  --patch-file "patch.txt"

# 2) Dry-run (미리보기, 파일 변경 ❌)
python3 skills/robust-patcher/scripts/run_robust_patcher.py \
  --file "src/main.py" \
  --patch-file "patch.txt" \
  --dry-run

# 3) 패치 파일 예시 (patch.txt)
cat <<'EOF' > patch.txt
<<<<<<< SEARCH
def greet(name):
    return 'hello ' + name
=======
def greet(name):
    return f'hello {name}'
>>>>>>> REPLACE
EOF
```

## 4. 주요 특징
- **Fuzzy Match**: 들여쓰기나 빈 줄 차이가 있어도 80% 이상 유사하면 패치를 적용합니다 (`difflib.SequenceMatcher.ratio()` 기반).
- **Auto-Validation**: 패치 후 Python 문법 에러가 발생하면 파일에 저장하지 않고 실패를 보고합니다 (atomic semantics — 실패 시 원본 보존).
- **Per-block Traceability**: 각 SEARCH/REPLACE block 의 matched / fuzzy_score / preview 를 `applied_blocks` 에 emit (Pydantic schema 정합).

## 5. 출력 계약 (Output Contract)

| field | type | 설명 |
|---|---|---|
| `status` | `"ok" / "error"` | 실행 결과 상태 |
| `file_path` | `str` | 패치된 절대 경로 |
| `message` | `str` | 인간 가독 요약 (예: `Successfully applied 3 patch block(s).`) |
| `dry_run` | `bool` | `--dry-run` 모드 여부 |
| `applied_blocks` | `list[AppliedPatchBlock]` | block 별 detail (`block_index` / `matched` / `fuzzy_score` / `preview`) |
| `syntax_validated` | `bool` | `.py` 파일의 post-patch syntax check 통과 여부 |
| `source_context` | `RobustPatcherSourceContext` | `--file` / `--patch-file` 입력 path |

## 6. error_code 분류 (4종)

- `missing_required_document` — `--file` 또는 `--patch-file` 경로 부재 (사전 차단)
- `malformed_patch_block` — patch_content 에 valid SEARCH/REPLACE block 자체가 없음
- `fuzzy_match_failed` — SEARCH block 이 fuzzy threshold 0.8 못 넘김 (atomic rollback) 또는 post-patch SyntaxError
- `robust_patcher_runtime_error` — 예기치 않은 예외 (catch-all)


## v0.6.5 Stage Completion

본 skill 의 출력은 v0.6.5 부터 v0.6.4 의 [Stage Gate Pattern](../../../core/stage_gate_pattern.md) 의 `stage_completion` 필드를 포함한다.

| Field | 값 |
|---|---|
| `stage_name` | `robust-patcher` |
| `next_stage` | `validation-plan` |
| `approval_actor` | `user` mandatory (state 문서 영향) |
| `approval_timestamp` | ISO 8601 |

자세한 spec: [`core/stage_gate_pattern.md`](../../../core/stage_gate_pattern.md), [`core/output_schema_guide.md §3.4`](../../../core/output_schema_guide.md).
