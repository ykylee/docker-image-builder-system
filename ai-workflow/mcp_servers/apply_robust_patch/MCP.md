# Apply-Robust-Patch MCP

- 문서 목적: `apply_robust_patch` MCP 의 역할과 구현 진입점을 정리한다.
- 범위: 목적, 연결 카탈로그, 예상 입력/출력, 읽기/쓰기 성격, 구현 메모
- 대상 독자: MCP 구현자, AI agent 설계자, 운영자
- 상태: stable
- 최종 수정일: 2026-07-16
- 관련 문서: `../../core/workflow_mcp_candidate_catalog.md`, `../../skills/robust-patcher/SKILL.md`, `../../workflow_kit/common/schemas/apply_robust_patch.py` (Pydantic schema)

## 1. 목적

대상 파일에 SEARCH/REPLACE 블록을 적용해 정밀한 코드 패치를 수행한다. `robust_patcher` skill 과 페어링하여 AI agent 가 생성한 패치를 실제 파일에 안전하게 반영한다.

`workflow_kit.common.writing_bundle.apply_robust_patch_payload` 기반으로 구현되어 있으며, 쓰기 작업을 수행하는 몇 안 되는 MCP 프로토타입 중 하나다.

## 2. 연결 카탈로그

- 후보 카탈로그: [../../core/workflow_mcp_candidate_catalog.md](../../core/workflow_mcp_candidate_catalog.md)

## 3. 예상 입력

- `file_path` (string, required): 패치 대상 파일 경로
- `patch_content` (string, required): SEARCH/REPLACE 블록 내용

```json
{
  "file_path": "src/app/main.py",
  "patch_content": "<<<<<<< SEARCH\noriginal code block\n=======\nreplacement code block\n>>>>>>> REPLACE"
}
```

## 4. 예상 출력

- `status`: `"ok"` | `"error"`
- `patched`: (bool) 패치 적용 성공 여부
- `tool_version`: workflow_kit 버전
- `warnings`: (list) 경고 메시지

```json
{
  "status": "ok",
  "patched": true,
  "tool_version": "0.5.10-beta",
  "warnings": []
}
```

## 5. 읽기/쓰기 성격

- 쓰기 (파일 수정)

## 6. 구현 메모

- `workflow_kit.common.writing_bundle` 을 통해 구현
- SEARCH 블록이 유일하게 매칭되는지 검증 후 REPLACE 수행
- 실행 스크립트: `workflow-source/mcp_servers/apply_robust_patch/scripts/run_apply_robust_patch.py`
- `mcp_main` 을 통해 `tool_version` 이 출력 envelope 에 자동 주입됨

## 7. 현재 상태

- 실행 프로토타입 스크립트 있음
- 쓰기 작업이므로 적용 전 dry-run 또는 백업을 권장

## 다음에 읽을 문서

- mcp 허브: [../README.md](../README.md)
