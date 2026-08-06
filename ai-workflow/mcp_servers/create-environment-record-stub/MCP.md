# Create-Environment-Record-Stub MCP

- 문서 목적: `create_environment_record_stub` MCP 프로토타입의 역할과 구현 진입점을 정리한다.
- 범위: 목적, 연결 카탈로그, 예상 입력/출력, 읽기/쓰기 성격, 구현 메모
- 대상 독자: MCP 구현자, AI agent 설계자, 운영자
- 상태: prototype
- 최종 수정일: 2026-06-09
- 관련 문서: `../../core/workflow_mcp_candidate_catalog.md`

## 1. 목적

호스트명과 운영체제 유형을 입력받아 환경 기록(repository assessment)의 스텁 초안을 생성한다. 신규 프로젝트 도입 시점이나 환경이 변경되었을 때 `repository_assessment.md` 의 초안을 빠르게 작성할 수 있도록 보조한다.

`workflow_kit.common.read_only_bundle.create_environment_record_stub_payload` 기반으로 구현된 읽기 전용 프로토타입이다.

## 2. 연결 카탈로그

- 후보 카탈로그: [../../core/workflow_mcp_candidate_catalog.md](../../core/workflow_mcp_candidate_catalog.md)

## 3. 예상 입력

- `hostname` (string, required): 대상 호스트명
- `os_type` (string, required): 운영체제 유형 (예: `linux`, `macos`, `windows`)

```json
{
  "hostname": "dev-server-01",
  "os_type": "linux"
}
```

## 4. 예상 출력

- `status`: `"ok"` | `"error"`
- `environment_record_stub`: (string) 생성된 환경 기록 초안 (markdown)
- `tool_version`: workflow_kit 버전
- `warnings`: (list) 경고 메시지

```json
{
  "status": "ok",
  "environment_record_stub": "# 환경 기록\n\n- 호스트명: dev-server-01\n- 운영체제: linux\n...",
  "tool_version": "0.5.10-beta",
  "warnings": []
}
```

## 5. 읽기/쓰기 성격

- 읽기 전용 (스텁 초안 생성만 수행, 파일 쓰기 없음)

## 6. 구현 메모

- `workflow_kit.common.read_only_bundle` 을 통해 구현
- 실행 스크립트: `workflow-source/mcp_servers/create-environment-record-stub/scripts/run_create_environment_record_stub.py`
- `mcp_main` 을 통해 `tool_version` 이 출력 envelope 에 자동 주입됨
- 생성된 스텁은 참고용이며, 실제 `repository_assessment.md` 는 수동 편집이 필요

## 7. 현재 상태

- 실행 프로토타입 스크립트 있음

## 다음에 읽을 문서

- mcp 허브: [../README.md](../README.md)
