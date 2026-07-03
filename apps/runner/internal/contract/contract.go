// Package contract 는 canonical contract v2 의 Go 측 단일 source-of-truth 다.
//
// `packages/shared-contract/src/build/{status,errors,phase}.ts` (TypeScript, frontend/build-server)
// 와 `apps/skill_mcp/contract/canonical.py` (Python, skill/MCP) 의 3-way mirror.
// 각 enums 가 변경될 때 세 layer 모두 동시 수정 필수 — `apps/runner/internal/contract/contract_test.go`
// 와 Python `contract-drift-checker` 의 Python↔TS sync 그룹이 structural guarantee 를 제공한다.
//
// 사용 규칙:
//
//   - 코드 안에서 다른 layer 와 통신할 때 (Host Server API 호출 / 응답 파싱 /
//     report payload 작성) status / phase / errorCode 를 string literal 로 직접 쓰면 안
//     된다. 반드시 이 패키지의 const 를 참조한다.
//   - 새 enum 값 추가 시: TS + Python + Go 세 layer 동시 수정. 한 쪽만 추가하고
//     빌드/테스트 통과해도 drift checker 가 잡는다.
//
// TASK-062 도입. 기존 `apps/runner/internal/{services,worker,hostclient}` 의
// string literal 들은 모두 이 패키지의 const 로 일원화.
package contract
