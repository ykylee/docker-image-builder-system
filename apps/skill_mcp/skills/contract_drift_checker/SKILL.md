# Skill: contract-drift-checker

- 문서 목적: `packages/shared-contract` (TS, `src/build/*.ts`) 의 enum / request schema 와 canonical 문서 `docs/sdlc/contracts/01-shared-build-contract-baseline.md` 의 §5/§6/§7/§8 enum block + §3 BuildRequest payload 표를 비교해 drift 리포트를 만든다. 비개발자 / AI agent 가 "코드가 canonical 과 어긋났어?" 라고 물을 때 사용.
- 범위: 4개 enum (BuildStatus / PreviewStatus / BuildPhase / ErrorCode) 의 symmetric difference + BuildRequest field 차이. **읽기 전용** — 코드를 수정하지 않는다. Go Runner 측은 본 단계에서는 spec mirror 가정이라 검사하지 않는다.
- 대상 독자: AI agent, Build Server / Runner 구현자, Skill/MCP 구현자, 프로젝트 리드
- 상태: draft (v0.1.0)
- 최종 수정일: 2026-07-03
- 관련 문서:
  - canonical: [`docs/sdlc/contracts/01-shared-build-contract-baseline.md`](../../../../docs/sdlc/contracts/01-shared-build-contract-baseline.md) §3/§5/§6/§7/§8
  - 검사 대상: [`packages/shared-contract/src/build/{status,phase,errors,request}.ts`](../../../../packages/shared-contract/src/build/)
  - 후보 카탈로그: [`docs/sdlc/13-skills-and-mcp-plan.md`](../../../../docs/sdlc/13-skills-and-mcp-plan.md) §3.5

## 1. 입출력 계약

### 1.1 입력 (JSON)

```json
{
  "contractPath": "packages/shared-contract/src/build",
  "canonicalPath": "docs/sdlc/contracts/01-shared-build-contract-baseline.md",
  "enums": ["buildStatuses", "previewStatuses", "buildPhases", "errorCodes"],
  "checkRequest": true
}
```

- `contractPath` optional. 기본 `packages/shared-contract/src/build` (저장소 루트 기준 상대 경로).
- `canonicalPath` optional. 기본 `docs/sdlc/contracts/01-shared-build-contract-baseline.md`.
- `enums` optional. 기본 4종 모두. 부분 검사 시 list.
- `checkRequest` optional. 기본 `true`. BuildRequest field 비교 수행 여부.
- 입력은 모두 optional. 비어 있으면 모든 기본값으로 검사.

### 1.2 출력 (JSON)

```json
{
  "ok": true,
  "drift_items": [
    {
      "kind": "missing_in_code",
      "enum": "buildStatuses",
      "value": "PREPARING",
      "canonical_section": "§5"
    }
  ],
  "summary": {
    "total": 5,
    "missing_in_code": 4,
    "extra_in_code": 1,
    "by_enum": {
      "buildStatuses": {"missing": 4, "extra": 1, "shared": 1},
      "previewStatuses": {"missing": 3, "extra": 2, "shared": 3}
    }
  },
  "ref": {
    "contract_doc": "docs/sdlc/contracts/01-shared-build-contract-baseline.md",
    "skill_version": "v1"
  }
}
```

- `ok`: drift 가 0개면 `true`, 1개 이상이면 `false`.
- `drift_items[]`: 각 drift 의 `kind` / `enum` / `value` / `canonical_section`.
  - `kind`: `missing_in_code` (canonical 에만 있음), `extra_in_code` (TS 에만 있음), `field_name_mismatch` (BuildRequest field drift).
  - `enum`: `buildStatuses` / `previewStatuses` / `buildPhases` / `errorCodes` / `buildRequestFields`.
- `summary.total`: drift 개수.
- `ref.contract_doc`: canonical 문서 경로.

## 2. 동작 규칙

- **enum 추출 (TS)**: 각 `<name>.ts` 파일에서 `export const <exportName> = [ ... ] as const;` 블록의 word 들을 순서 보존하여 추출. word 패턴 `^[A-Z][A-Z0-9_]*$` (UPPER_SNAKE_CASE) 만 인정.
- **enum 추출 (canonical)**: `01-shared-build-contract-baseline.md` 의 §5/§6/§8 의 ```text ... ``` code block 안의 UPPER_SNAKE_CASE word 들을 추출. §7 phase key 는 동일 방식으로 추출하되, "권장 phase key" 라는 헤더가 있으면 reference set 으로 다룸 (canonical-only 도 drift 로 보되 `kind=missing_in_code` 의 `severity=low` 표기는 후속 TASK).
- **BuildRequest field (TS)**: `request.ts` 의 `buildRequestSchema = z.object({ ... })` 안의 key 이름 (top-level 만) 추출.
- **BuildRequest field (canonical)**: §3 "최소 Build Request Payload" 의 §3.1 "필수 필드" + §3.2 "권장 필드" 표에서 key 이름 추출. 두 표의 합집합.
- **drift 종류**:
  - `missing_in_code`: canonical 에만 있는 word/field. 코드가 canonical 을 못 따라간 경우.
  - `extra_in_code`: TS 에만 있는 word/field. canonical 갱신이 필요할 수 있음.
  - `field_name_mismatch`: BuildRequest field 가 TS 와 canonical 둘 다에 있지만 이름이 다른 경우 (e.g. `userId` vs `projectId`). 단, 이름이 다른 경우에만 `extra_in_code` + `missing_in_code` 양쪽으로 보고 (각각 출처 표기).
- **비교 순서**: 4개 enum → BuildRequest field. enum 이름 → UPPER_SNAKE_CASE word 알파벳 순서가 아닌 정의 순서로.

## 3. 읽기/쓰기 권한 경계

- 읽기: `packages/shared-contract/src/build/*.ts` 4개 파일 + canonical markdown 1개.
- 쓰기: 없음. 본 skill 은 진단만. drift 수정 책임은 canonical / 코드 owner 의 별개 결정.
- CI/통합 시 fail 정책은 본 skill 범위 밖. 호출자가 `ok=false` 를 받아서 정책 결정.

## 4. 에러 코드

- `MISSING_FIELD` — `contractPath` / `canonicalPath` 가 가리키는 파일이 부재.
- `INVALID_INPUT` — 입력 dict 가 아니거나 `enums` 항목이 4종 외의 이름.
- `PARSE_ERROR` — TS 또는 markdown 파일을 읽었지만 패턴 매칭 실패 (해당 enum skip + warning).
- `IO_ERROR` — 파일 시스템 읽기 실패.

## 5. 후속 구현 포인트

- Go Runner 측 mirror 자동 생성 (`./scripts/gen-go-contracts.sh`) 결과물과 canonical 비교는 후속.
- drift 발생 시 canonical / code 양쪽 owner 자동 알림 (Slack MCP 등) 은 후속.
- severity (`low` / `high`) 와 exit code 정책은 TASK-017 의 CI 정착 시 결정.
